import mongoose from 'mongoose';

const contactListSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: String,
    contactCount: { type: Number, default: 0 },
    brevoListId: Number,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

contactListSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const ContactList = mongoose.model('ContactList', contactListSchema);
