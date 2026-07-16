import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },
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
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
