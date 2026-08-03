const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');
const Department = require('./models/Department');
const Category = require('./models/Category');
const Doc = require('./models/Docs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 222;
const MONGO_URI = process.env.MONGO_URI;
const multer = require('multer');
const cloudinary = require('./cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the public directory

// MongoDB connection
mongoose.connect(MONGO_URI)
.then(async () => {

    console.log("MongoDB connected");

    try {

        const adminExists = await User.findOne({ username: "admin" });

        if (!adminExists) {

            console.log("Creating default admin...");

            let dept = await Department.findOne({ name: "Administration" });

            if (!dept) {

                dept = await Department.create({
                    name: "Administration"
                });

                console.log("Administration department created.");
            }

            const hashedPassword = await bcrypt.hash("Admin@123", 10);

            await User.create({
                username: "admin",
                password: hashedPassword,
                department: dept._id,
                role: "admin"
            });

            console.log("✅ Default admin created.");
        }

    } catch (err) {

        console.error("Bootstrap Error:", err);

    }

})
.catch(err => console.error("MongoDB connection error:", err));

// Multer setup for file uploads
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: "DocManager",
        resource_type: "raw",
        public_id: Date.now() + "-" + path.parse(file.originalname).name,
        format: "pdf"
    })
});

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

app.use(session({
    secret: 'dfvsADgbafbadfbvSy',  // Change this to a secure secret
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge:  60 * 60 * 1000 // 1 hour
    }
}));

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Routes

// User login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username }).populate('department');
        if (!user) {
            return res.render('login', { 
                error: 'User not found',
                user: null
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { 
                error: 'Invalid credentials',
                user: null
            });
        }

        req.session.user = user;
        return res.redirect('/dashboard'); // Redirect to dashboard after successful login
    } catch (error) {
        console.error('Login error:', error);
        return res.render('login', {
            error: 'An error occurred during login',
            user: null
        });
    }
});



const isAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }

    console.log('User role:', req.session.user.role);
    if (req.session.user.role !== 'admin') {
        return res.redirect('/dashboard');
    }

    // Attach user to request object for convenience
    req.user = req.session.user;
    next();
};


// Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }
    req.user = req.session.user; // Attach user to request object
    next();
};


app.get('/add_user', isAdmin, async (req, res) => {
    try {
        
        const departments = await Department.find();
        res.render('add_user.ejs', { departments, user: req.user });
    } catch (error) {
        res.status(500).json({ error: 'Error checking user role' });
    }
});


app.post('/add_user', async (req, res) => {
    const { username, password, department } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, department });
        await newUser.save();
        return res.redirect('/add_user')
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/", (req, res) => {
    res.render("login.ejs",{
        user: req.user || null,
        layout: 'base'
    });
});


// User logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Error logging out' });
        }
        res.redirect('/'); // Redirect to login page after logout
    });
});

// Create department
app.post('/departments', async (req, res) => {
    const { name } = req.body;
    try {
        const newDepartment = new Department({ name });
        await newDepartment.save();
        res.status(201).json({ message: 'Department created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error creating department' });
    }
});

// Get all departments
app.get('/departments', async (req, res) => {
    try {
        const departments = await Department.find();
        res.status(200).json(departments);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching departments' });
    }
});

// Category routes
app.get('/add_category', isAdmin, async (req, res) => {
    try {
        res.render('add_category', {
            user: req.session.user,
            layout: 'base'
        });
    } catch (error) {
        console.error('Error loading add category page:', error);
        res.status(500).render('error', {
            error: 'Error loading page',
            user: req.session.user
        });
    }
});

app.post('/categories', isAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        const newCategory = new Category({ name });
        await newCategory.save();
        res.status(201).json({ message: 'Category created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error creating category' });
    }
});

app.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().sort('name');
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

app.delete('/categories/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findByIdAndDelete(id);
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Error deleting category' });
    }
});


app.get('/users', async (req, res) => {
    try {
        const users = await User.find()
            .populate('department')
            .select('-password')  // Exclude password from results
            .sort('username');
        res.json(users);
        console.log(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Error fetching users' });
    }
});

// Upload document
app.post('/upload', isLoggedIn, upload.array('documents', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const { department, category } = req.body;

        // Create a database entry for each uploaded file
        const uploadPromises = req.files.map(async (file) => {
            const newDoc = new Doc({
                department: department || req.user.department,
                category: category,
                files: [{
                    originalname: file.originalname,
                    filename: file.filename,
                    path: file.path,
                    cloudinaryUrl: file.path,
                    publicId: file.filename || file.public_id,
                    uploadDate: new Date()
                }],
                uploadedBy: req.user._id
            });

            await newDoc.save();
            return newDoc;
        });

        // Wait for all documents to be saved
        await Promise.all(uploadPromises);

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(201).json({ message: 'Documents uploaded successfully' });
        }
        return res.redirect('/dashboard');
    } catch (error) {
        console.error("========== UPLOAD ERROR ==========");
        console.error(error);
        console.error(error.stack);
        console.error("==================================");
        // Delete uploaded files if database operation fails
        // Nothing to delete.
        // Cloudinary handles uploads directly.
        res.status(500).json({ error: 'Error uploading documents' });
    }
});


app.delete('/documents/:id', async (req, res) => {
    try {

        const { id } = req.params;

        const document = await Doc.findByIdAndDelete(id);

        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        if (document.files && document.files.length > 0) {

            for (const file of document.files) {

                if (file.publicId) {

                    await cloudinary.uploader.destroy(file.publicId, {
                        resource_type: "raw"
                    });

                }

            }

        }

        res.status(200).json({
            message: "Document deleted successfully"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Error deleting document"
        });

    }
});





// Get all documents for a department
app.get('/documents/:departmentId', async (req, res) => {
    const { departmentId } = req.params;
    try {
        const documents = await Doc.find({ department: departmentId }).populate('department').populate('category');
        res.status(200).json(documents);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching documents' });
    }
});

// Get document by ID
app.get('/documents/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const document = await Doc.findById(id).populate('department').populate('category');
        if (!document) return res.status(404).json({ error: 'Document not found' });
        res.status(200).json(document);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching document' });
    }
});


// Delete document
app.delete('/documents/:id', async (req, res) => {

    try {

        const { id } = req.params;

        const document = await Doc.findByIdAndDelete(id);

        if (!document) {
            return res.status(404).json({
                error: 'Document not found'
            });
        }

        if (document.files && document.files.length > 0) {

            for (const file of document.files) {

                if (file.publicId) {

                    await cloudinary.uploader.destroy(file.publicId, {
                        resource_type: "raw"
                    });

                }

            }

        }

        res.status(200).json({
            message: 'Document deleted successfully'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: 'Error deleting document'
        });

    }

});

app.get('/dashboard', isLoggedIn, async (req, res) => {

    try {

        let documents;

        if (req.session.user.role === "admin") {

            documents = await Doc.find()
                .populate("department")
                .populate("category")
                .populate("uploadedBy")
                .sort({ "files.0.filename": 1 });

        } else {

            documents = await Doc.find({
                department: req.user.department
            })
            .populate("department")
            .populate("category")
            .populate("uploadedBy")
            .sort({ "files.0.filename": 1 });

        }

        res.render("dashboard", {
            user: req.user,
            documents
        });

    } catch (err) {

        console.error(err);

        res.status(500).send("Dashboard Error");

    }

});

app.get('/add_department', isAdmin, async (req, res) => {
    try {
        res.render('add_department', {
            user: req.session.user,
            layout: 'base'
        });
    } catch (error) {
        console.error('Error loading add department page:', error);
        res.status(500).render('error', {
            error: 'Error loading page',
            user: req.session.user
        });
    }
});


// View document route
app.get('/docs/view/:id', isLoggedIn, async (req, res) => {
    try {
        const document = await Doc.findById(req.params.id)
            .populate('department')
            .populate('category')
            .populate('uploadedBy');

        if (!document) {
            return res.status(404).render('error', {
                error: 'Document not found',
                user: req.session.user
            });
        }


        res.render('view_doc', {
            document,
            user: req.session.user,
            layout: 'base'
        });
    } catch (error) {
        console.error('Error viewing document:', error);
        res.status(500).render('error', {
            error: 'Error loading document',
            user: req.session.user
        });
    }
});

app.delete('/departments/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if department exists
        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ error: 'Department not found' });
        }

        // Check if department has users
        const usersInDept = await User.countDocuments({ department: id });
        if (usersInDept > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete department with active users. Please reassign users first.' 
            });
        }

        // Check if department has documents
        const docsInDept = await Doc.countDocuments({ department: id });
        if (docsInDept > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete department with existing documents. Please move or delete documents first.' 
            });
        }

        // Delete the department
        await Department.findByIdAndDelete(id);
        res.status(200).json({ message: 'Department deleted successfully' });

    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ error: 'Error deleting department' });
    }
});

// Stream document route (for embed source)
app.get('/docs/stream/:id', isLoggedIn, async (req, res) => {

    try {

        const document = await Doc.findById(req.params.id);

        if (!document || !document.files.length) {

            return res.status(404).send("Document not found");

        }

        return res.redirect(document.files[0].cloudinaryUrl);

    } catch (err) {

        console.error(err);

        return res.status(500).send("Unable to open document");

    }

});


// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
