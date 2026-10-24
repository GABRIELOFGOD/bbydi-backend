import mongoose, { Model, Schema } from "mongoose";

type DataMigrationType = {
  _id: string;
  completedAt: Date;
};

const DataMigrationSchema = new Schema<DataMigrationType>({
  _id: { type: String, required: true },
  completedAt: { type: Date, required: true },
}, { versionKey: false, collection: "dataMigrations" });

const DataMigration: Model<DataMigrationType> =
  mongoose.models.DataMigration ??
  mongoose.model<DataMigrationType>("DataMigration", DataMigrationSchema);

export default DataMigration;
