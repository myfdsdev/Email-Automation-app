import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Not required for Google accounts, which never set one. Guard every read with
    // `if (!user.password)` — bcrypt.compare throws on undefined.
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      select: false,
    },
    // Set only after Google confirms email_verified, which is what makes linking an
    // existing local account to a Google identity safe.
    googleId: { type: String, index: true, sparse: true, unique: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    refreshTokens: [
      {
        tokenHash: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        userAgent: String,
      },
    ],
    isPlatformAdmin: { type: Boolean, default: false },
    defaultWorkspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
    avatarUrl: String,
    lastLoginAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  // Google-only accounts have no password hash; bcrypt.compare would throw on undefined.
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    isEmailVerified: this.isEmailVerified,
    isPlatformAdmin: this.isPlatformAdmin,
    defaultWorkspace: this.defaultWorkspace,
    avatarUrl: this.avatarUrl,
    // Lets the UI explain why password fields differ for Google accounts. Note that
    // `password` is select:false, so it cannot be inferred here — only googleId can.
    isGoogleAccount: !!this.googleId,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
