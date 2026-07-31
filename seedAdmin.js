const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Department = require('./models/Department');

// MongoDB Atlas URI
const MONGO_URI = "mongodb+srv://deepssunrise_db_user:TransactHub2026@transacthub.06d0hmn.mongodb.net/docmanager?retryWrites=true&w=majority&appName=TransactHub";

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // Check if admin already exists
        const existingAdmin = await User.findOne({ username: "admin" });

        if (existingAdmin) {
            console.log("⚠️ Admin user already exists.");
            process.exit(0);
        }

        // Create default department
        let department = await Department.findOne({ name: "Administration" });

        if (!department) {
            department = await Department.create({
                name: "Administration"
            });
            console.log("✅ Department created");
        }

        // Hash password
        const hashedPassword = await bcrypt.hash("Admin@123", 10);

        // Create admin user
        await User.create({
            username: "admin",
            password: hashedPassword,
            department: department._id,
            role: "admin"
        });

        console.log("🎉 Admin user created successfully!");
        console.log("--------------------------------");
        console.log("Username : admin");
        console.log("Password : Admin@123");
        console.log("--------------------------------");

        process.exit(0);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
