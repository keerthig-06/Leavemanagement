const express = require('express');
const router = express.Router();
const User = require('../model/User');
const Admin = require('../model/Admin');
const {
    constantTimeCompare,
    createToken,
    getAdminConfig,
    hashPassword,
    requireAdmin,
    verifyPassword
} = require('./adminAuth');

const isValidUserId = (id) => /^[a-fA-F0-9]{24}$/.test(id);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const getAdminFieldErrors = (details) => {
    const errors = {};

    if (typeof details.username !== 'string' || !details.username.trim()) {
        errors.username = 'Enter an admin username.';
    }
    if (typeof details.email !== 'string' || !emailRegex.test(details.email.trim())) {
        errors.email = 'Enter a valid admin email address.';
    }
    if (typeof details.password !== 'string' || details.password.length < 8) {
        errors.password = 'Password must be at least 8 characters.';
    }
    if (typeof details.department !== 'string' || !details.department.trim()) {
        errors.department = 'Enter a department.';
    }
    if (typeof details.designation !== 'string' || !details.designation.trim()) {
        errors.designation = 'Enter a designation.';
    }

    return errors;
};

const createAdmin = async (details, isInitialAdmin = false) => {
    const credentials = await hashPassword(details.password);
    return Admin.create({
        username: details.username.trim(),
        email: details.email.trim().toLowerCase(),
        department: details.department.trim(),
        designation: details.designation.trim(),
        ...credentials,
        isInitialAdmin
    });
};

// Route to handle user registration

router.post('/register', async (req, res) => {
    const {
        username,
        email,
        password,
        rollNumber,
        department = 'General',
        casualLeave = 0,
        medicalLeave = 0
    } = req.body || {};

    try {
        const fieldErrors = {};

        if (typeof username !== 'string' || !username.trim()) {
            fieldErrors.username = 'Enter a username.';
        }

        if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
            fieldErrors.email = 'Enter a valid email address.';
        }

        if (typeof password !== 'string' || password.length < 8) {
            fieldErrors.password = 'Password must be at least 8 characters.';
        }

        if (typeof rollNumber !== 'string' || !rollNumber.trim()) {
            fieldErrors.rollNumber = 'Enter a roll number.';
        }

        if (typeof department !== 'string' || !department.trim()) {
            fieldErrors.department = 'Enter a department.';
        }

        if (!Number.isSafeInteger(casualLeave) || casualLeave < 0) {
            fieldErrors.casualLeave = 'Enter a valid casual leave balance.';
        }

        if (!Number.isSafeInteger(medicalLeave) || medicalLeave < 0) {
            fieldErrors.medicalLeave = 'Enter a valid medical leave balance.';
        }

        if (Object.keys(fieldErrors).length) {
            return res.status(400).json({
                message: 'Correct the highlighted student details.',
                fieldErrors
            });
        }

        const existingUser = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (existingUser) {
            return res.status(400).json({
                message: 'This email is already registered.',
                fieldErrors: {
                    email: 'This email is already registered.'
                }
            });
        }

        const credentials = await hashPassword(password);

        const newUser = new User({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            rollNumber: rollNumber.trim(),
            department: department.trim(),
            casualLeave,
            medicalLeave,
            ...credentials
        });

        await newUser.save();

        return res.status(201).json({
            message: 'Student registered successfully.',
            userId: newUser._id,
            username: newUser.username,
            rollNumber: newUser.rollNumber,
            casualLeave: newUser.casualLeave,
            medicalLeave: newUser.medicalLeave
        });

    } catch (error) {
        console.error('Error creating user:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: 'This email is already registered.',
                fieldErrors: {
                    email: 'This email is already registered.'
                }
            });
        }

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});


router.get('/admin/setup-status', async (req, res) => {
    const config = getAdminConfig();

    if (!config || config.setupKey.length < 32) {
        return res.status(503).json({
            message: 'Admin setup is not configured on the server.'
        });
    }

    try {
        const existingAdmin = await Admin.exists({ isInitialAdmin: true });

        return res.json({ available: !existingAdmin });
    } catch (error) {
        console.error('Error checking admin setup status:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.post('/admin/setup', async (req, res) => {
    const config = getAdminConfig();
    const { setupKey, ...details } = req.body || {};

    if (!config || config.setupKey.length < 32) {
        return res.status(503).json({
            message: 'Admin setup is not configured on the server.'
        });
    }

    if (
        typeof setupKey !== 'string' ||
        !constantTimeCompare(setupKey, config.setupKey)
    ) {
        return res.status(401).json({
            message: 'The admin setup key is incorrect.',
            fieldErrors: { setupKey: 'The admin setup key is incorrect.' }
        });
    }

    const fieldErrors = getAdminFieldErrors(details);
    if (Object.keys(fieldErrors).length) {
        return res.status(400).json({
            message: 'Correct the highlighted admin details.',
            fieldErrors
        });
    }

    try {
        if (await Admin.exists({ isInitialAdmin: true })) {
            return res.status(409).json({
                message: 'Initial admin has already been created. Ask an admin to create another account.'
            });
        }

        const admin = await createAdmin(details, true);

        return res.status(201).json({
            message: 'Admin account created. You can now sign in.',
            adminId: admin._id
        });
    } catch (error) {
        console.error('Error creating initial admin:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: 'This admin username or email is already registered.',
                fieldErrors: {
                    username: 'This username may already be registered.',
                    email: 'This email may already be registered.'
                }
            });
        }

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.post('/admin/login', async (req, res) => {
    const config = getAdminConfig();
    const { username, email, password } = req.body || {};

    if (!config) {
        return res.status(503).json({
            message: 'Admin sessions are not configured on the server.'
        });
    }

    if (
        typeof username !== 'string' ||
        typeof email !== 'string' ||
        typeof password !== 'string'
    ) {
        return res.status(400).json({
            message: 'Enter the missing admin login details.',
            fieldErrors: {
                ...(typeof username !== 'string' && { username: 'Enter your admin username.' }),
                ...(typeof email !== 'string' && { email: 'Enter your admin email address.' }),
                ...(typeof password !== 'string' && { password: 'Enter your admin password.' })
            }
        });
    }

    try {
        const admin = await Admin.findOne({
            username: username.trim(),
            email: email.trim().toLowerCase()
        }).select('+passwordHash +passwordSalt');

        if (!admin || !(await verifyPassword(password, admin))) {
            return res.status(401).json({
                message: 'The username, email, or password is incorrect.',
                fieldErrors: {
                    username: 'Check the admin username.',
                    email: 'Check the admin email address.',
                    password: 'The username, email, or password is incorrect.'
                }
            });
        }

        return res.json({
            message: 'Admin login successful.',
            token: createToken(admin, config.secret),
            admin: {
                username: admin.username,
                email: admin.email,
                department: admin.department,
                designation: admin.designation
            }
        });
    } catch (error) {
        console.error('Error during admin login:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.use('/admin', requireAdmin);

router.get('/admin/users', async (req, res) => {
    try {
        const users = await User.find({})
            .select('username email rollNumber department casualLeave medicalLeave')
            .sort({ username: 1 })
            .lean();

        return res.json({ users });
    } catch (error) {
        console.error('Error fetching admin user list:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.patch('/admin/users/:id', async (req, res) => {
    if (!isValidUserId(req.params.id)) {
        return res.status(400).json({
            message: 'Invalid user ID.'
        });
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};
    const allowedFields = ['username', 'email', 'rollNumber', 'department', 'casualLeave', 'medicalLeave'];
    const updates = {};

    for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            updates[field] = body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            message: 'At least one user field must be provided.'
        });
    }

    for (const field of ['username', 'email', 'rollNumber', 'department']) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
            if (typeof updates[field] !== 'string' || !updates[field].trim()) {
                return res.status(400).json({
                    message: `${field} must be a non-empty string.`
                });
            }

            updates[field] = updates[field].trim();
        }
    }

    if (updates.email) {
        updates.email = updates.email.toLowerCase();

        if (!emailRegex.test(updates.email)) {
            return res.status(400).json({
                message: 'Invalid email format.'
            });
        }
    }

    for (const field of ['casualLeave', 'medicalLeave']) {
        if (
            Object.prototype.hasOwnProperty.call(updates, field) &&
            (!Number.isSafeInteger(updates[field]) || updates[field] < 0)
        ) {
            return res.status(400).json({
                message: 'Leave balances must be non-negative integers.'
            });
        }
    }

    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('username email rollNumber department casualLeave medicalLeave');

        if (!user) {
            return res.status(404).json({
                message: 'User not found.'
            });
        }

        return res.json({
            message: 'User updated successfully.',
            user
        });
    } catch (error) {
        console.error('Error updating user:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: 'Email or roll number already exists.'
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: 'Invalid user details.'
            });
        }

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.delete('/admin/users/:id', async (req, res) => {
    if (!isValidUserId(req.params.id)) {
        return res.status(400).json({
            message: 'Invalid user ID.'
        });
    }

    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found.'
            });
        }

        return res.json({
            message: 'User deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting user:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.post('/admin/admins', async (req, res) => {
    const details = req.body || {};

    const fieldErrors = getAdminFieldErrors(details);
    if (Object.keys(fieldErrors).length) {
        return res.status(400).json({
            message: 'Correct the highlighted admin details.',
            fieldErrors
        });
    }

    try {
        const admin = await createAdmin(details);

        return res.status(201).json({
            message: 'Admin account created successfully.',
            admin: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                department: admin.department,
                designation: admin.designation
            }
        });
    } catch (error) {
        console.error('Error creating admin account:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: 'This admin username or email is already registered.',
                fieldErrors: {
                    username: 'This username may already be registered.',
                    email: 'This email may already be registered.'
                }
            });
        }

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.get('/admin/leave-requests', async (req, res) => {
    const status = req.query.status;
    const statuses = ['pending', 'approved', 'disapproved'];

    if (status && !statuses.includes(status)) {
        return res.status(400).json({
            message: 'Invalid leave request status.'
        });
    }

    try {
        const users = await User.find({
            'leaveRequests.0': { $exists: true }
        }).select('username email rollNumber department leaveRequests');

        const requests = users.flatMap((user) =>
            user.leaveRequests
                .filter((request) => !status || request.status === status)
                .map((request) => ({
                    id: request._id,
                    userId: user._id,
                    username: user.username,
                    email: user.email,
                    rollNumber: user.rollNumber,
                    department: user.department,
                    type: request.type,
                    days: request.days,
                    reason: request.reason,
                    status: request.status,
                    createdAt: request.createdAt,
                    reviewedAt: request.reviewedAt,
                    reviewNote: request.reviewNote
                }))
        );

        requests.sort((a, b) => b.createdAt - a.createdAt);
        return res.json({ requests });
    } catch (error) {
        console.error('Error fetching leave requests:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

router.patch('/admin/leave-requests/:userId/:requestId', async (req, res) => {
    const { userId, requestId } = req.params;
    const { action, reviewNote = '' } = req.body || {};

    if (!isValidUserId(userId) || !isValidUserId(requestId)) {
        return res.status(400).json({
            message: 'Invalid user or leave request ID.'
        });
    }

    if (
        action !== 'approve' &&
        action !== 'disapprove'
    ) {
        return res.status(400).json({
            message: 'Action must be approve or disapprove.'
        });
    }

    if (typeof reviewNote !== 'string' || reviewNote.length > 500) {
        return res.status(400).json({
            message: 'Review note must be 500 characters or fewer.'
        });
    }

    try {
        const query = {
            _id: userId,
            leaveRequests: {
                $elemMatch: {
                    _id: requestId,
                    status: 'pending'
                }
            }
        };
        let update = {
            $set: {
                'leaveRequests.$.status': action === 'approve' ? 'approved' : 'disapproved',
                'leaveRequests.$.reviewedAt': new Date(),
                'leaveRequests.$.reviewedBy': req.admin._id,
                'leaveRequests.$.reviewNote': reviewNote.trim()
            }
        };

        if (action === 'approve') {
            const pendingUser = await User.findOne({
                _id: userId,
                leaveRequests: {
                    $elemMatch: { _id: requestId, status: 'pending' }
                }
            }).select('leaveRequests');

            if (!pendingUser) {
                return res.status(409).json({
                    message: 'This request is no longer pending or has already been reviewed.'
                });
            }

            const pendingRequest = pendingUser.leaveRequests.id(requestId);
            const leaveField =
                pendingRequest.type === 'casual' ? 'casualLeave' : 'medicalLeave';
            query[leaveField] = { $gte: pendingRequest.days };
            update.$inc = { [leaveField]: -pendingRequest.days };
        }

        const user = await User.findOneAndUpdate(query, update, {
            new: true,
            runValidators: true
        });

        if (!user) {
            if (action === 'approve') {
                const pendingRequest = await User.findOne({
                    _id: userId,
                    leaveRequests: {
                        $elemMatch: { _id: requestId, status: 'pending' }
                    }
                }).select('leaveRequests');

                if (pendingRequest) {
                    const request = pendingRequest.leaveRequests.id(requestId);
                    return res.status(400).json({
                        message: `Insufficient ${request.type} leave balance to approve this request.`
                    });
                }
            }

            return res.status(409).json({
                message: 'This request has already been reviewed or no longer exists.'
            });
        }

        return res.json({
            message: action === 'approve'
                ? 'Leave request approved.'
                : 'Leave request disapproved.',
            casualLeave: user.casualLeave,
            medicalLeave: user.medicalLeave
        });
    } catch (error) {
        console.error('Error reviewing leave request:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

// Route to handle user login

router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    try {
        const fieldErrors = {};

        if (typeof email !== 'string' || !email.trim()) {
            fieldErrors.email = 'Enter your email address.';
        }

        if (typeof password !== 'string' || !password) {
            fieldErrors.password = 'Enter your password.';
        }

        if (Object.keys(fieldErrors).length) {
            return res.status(400).json({
                message: 'Enter your email and password.',
                fieldErrors
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        }).select('+passwordHash +passwordSalt');

        if (!user || !(await verifyPassword(password, user))) {
            return res.status(401).json({
                message: 'Invalid email or password.',
                fieldErrors: {
                    email: 'Check your email address.',
                    password: 'Invalid email or password.'
                }
            });
        }

        return res.json({
            message: 'Login successful.',
            userId: user._id,
            username: user.username,
            rollNumber: user.rollNumber,
            department: user.department,
            casualLeave: user.casualLeave,
            medicalLeave: user.medicalLeave,
            leaveRequests: user.leaveRequests
        });

    } catch (error) {
        console.error('Error during login:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});


// Route to get leave balance by user ID
router.get('/leave-balance/:id', async (req, res) => {
    try {
        if (!isValidUserId(req.params.id)) {
            return res.status(400).json({
                message: 'Invalid user ID.'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found.'
            });
        }

        return res.json({
            casualLeave: user.casualLeave,
            medicalLeave: user.medicalLeave,
            leaveRequests: user.leaveRequests
        });
    } catch (error) {
        console.error('Error fetching leave balance:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

// Leave balances are deducted only when an admin approves a pending request.
router.post('/apply-leave/:id', async (req, res) => {
    const { type, days, reason } = req.body || {};

    try {
        if (!isValidUserId(req.params.id)) {
            return res.status(400).json({
                message: 'Invalid user ID.'
            });
        }

        // Validate leave type
        if (type !== 'casual' && type !== 'medical') {
            return res.status(400).json({
                message: 'Invalid leave type.'
            });
        }

        // Require a positive integer
        if (
            !Number.isSafeInteger(days) ||
            days <= 0
        ) {
            return res.status(400).json({
                message: 'Number of days must be a positive integer.'
            });
        }

        if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) {
            return res.status(400).json({
                message: 'A reason of 1 to 1000 characters is required.'
            });
        }

        const leaveField =
            type === 'casual' ? 'casualLeave' : 'medicalLeave';
        const user = await User.findOneAndUpdate(
            {
                _id: req.params.id,
                [leaveField]: { $gte: days }
            },
            {
                $push: {
                    leaveRequests: {
                        type,
                        days,
                        reason: reason.trim(),
                        status: 'pending'
                    }
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!user) {
            const existingUser = await User.findById(req.params.id)
                .select('casualLeave medicalLeave');

            if (existingUser) {
                return res.status(400).json({
                    message: `Insufficient ${type} leave balance for this request.`
                });
            }

            return res.status(404).json({
                message: 'User not found.'
            });
        }

        return res.json({
            message: 'Leave request submitted and is awaiting admin review.',
            casualLeave: user.casualLeave,
            medicalLeave: user.medicalLeave,
            leaveRequests: user.leaveRequests
        });
    } catch (error) {
        console.error('Error applying for leave:', error);

        return res.status(500).json({
            message: 'Server error.'
        });
    }
});

module.exports = router;
