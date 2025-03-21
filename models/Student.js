const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const studentSchema = new Schema({
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Add password field
  clearanceStatus: { type: Map, of: String, default: {} },
  certificateGenerated: { type: Boolean, default: false },
});

module.exports = mongoose.model('Student', studentSchema);