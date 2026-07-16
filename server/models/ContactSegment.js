import mongoose from 'mongoose';

/**
 * Dynamic segment: filters stored as an array of { field, operator, value }
 * combined with AND logic, evaluated at query time.
 */
const contactSegmentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: String,
    filters: [
      {
        field: { type: String, required: true },
        operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'before', 'after'], default: 'equals' },
        value: mongoose.Schema.Types.Mixed,
      },
    ],
    estimatedCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

contactSegmentSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const ContactSegment = mongoose.model('ContactSegment', contactSegmentSchema);
