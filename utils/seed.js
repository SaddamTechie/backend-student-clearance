const {faker} = require('@faker-js/faker');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Student = require('../models/Student'); // Path to your Student schema
const Request = require('../models/Request'); // Path to your Request schema
const dotenv = require('dotenv');
dotenv.config();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI);
   

async function seedDatabase() {
  try {
    // Generate Students
    const students = [];
    for (let i = 0; i < 100; i++) {
      students.push({
        studentId: uuidv4(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        clearanceStatus: {
          finance: 'pending',
          library: 'pending',
          department: 'pending',
          hostel: 'pending',
          administration: 'pending',
        },
        certificateGenerated: false,
      });
    }
    await Student.insertMany(students);
    console.log('Students seeded successfully.');

    // Generate Requests
    const requests = [];
    const departments = ['finance', 'library', 'department', 'hostel', 'administration'];
    for (let i = 0; i < 200; i++) {
      requests.push({
        studentId: faker.helpers.arrayElement(students).studentId,
        department: faker.helpers.arrayElement(departments),
        status: faker.helpers.arrayElement(['pending', 'approved', 'rejected']),
        timestamp: faker.date.recent(),
      });
    }
    await Request.insertMany(requests);
    console.log('Requests seeded successfully.');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    mongoose.disconnect();
  }
}

seedDatabase();
