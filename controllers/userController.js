// Create test user for development environment
exports.registerTest = async (req, res) => {
    try {
        // Check if test user already exists
        const existingUser = await User.findOne({ email: 'test@example.com' });
        if (existingUser) {
            return res.status(200).json({
                success: true,
                message: 'Test user already exists',
                user: {
                    name: existingUser.name,
                    email: existingUser.email,
                    password: 'test123'
                }
            });
        }

        // Create new test user
        const hashedPassword = await bcrypt.hash('test123', 10);
        const newUser = new User({
            name: 'Test User',
            email: 'test@example.com',
            phone: '1234567890',
            password: hashedPassword,
            role: 'user'
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: 'Test user created successfully',
            user: {
                name: 'Test User',
                email: 'test@example.com',
                password: 'test123'
            }
        });
    } catch (error) {
        console.error('Error creating test user:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating test user',
            error: error.message
        });
    }
}; 