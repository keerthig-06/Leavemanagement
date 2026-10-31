let userId = null;
let adminToken = null;

// Helper function to safely read API responses
async function readResponse(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function clearFormFeedback(form) {
    form.querySelectorAll('.field-error').forEach((element) => {
        element.textContent = '';
    });
    form.querySelectorAll('.input-error').forEach((element) => {
        element.classList.remove('input-error');
        element.removeAttribute('aria-invalid');
    });

    const feedback = getFormFeedback(form);
    if (feedback) {
        feedback.textContent = '';
        feedback.classList.remove('success');
    }
}

function getFormFeedback(form) {
    const feedbackIds = {
        'login-form': 'student-login-feedback',
        'admin-login-form': 'admin-login-feedback',
        'admin-setup-form': 'admin-setup-feedback',
        'registration-form': 'registration-feedback',
        'create-admin-form': 'create-admin-feedback'
    };

    return document.getElementById(feedbackIds[form.id]);
}

function showFormErrors(form, errors = {}, message = '') {
    clearFormFeedback(form);
    let hasFieldErrors = false;

    for (const [fieldName, errorMessage] of Object.entries(errors)) {
        const field = form.elements.namedItem(fieldName);
        if (!field || typeof field.classList === 'undefined') {
            continue;
        }

        field.classList.add('input-error');
        field.setAttribute('aria-invalid', 'true');
        const errorElement = [...form.querySelectorAll('.field-error')]
            .find((element) => element.dataset.errorFor === fieldName);
        if (errorElement) {
            errorElement.textContent = errorMessage;
            hasFieldErrors = true;
        }
    }

    const feedback = getFormFeedback(form);
    if (feedback && message && (!hasFieldErrors || !Object.keys(errors).length)) {
        feedback.textContent = message;
    }
}

function validateAdminDetails(form, includeSetupKey = false) {
    const values = Object.fromEntries(new FormData(form));
    const errors = {};

    if (includeSetupKey && values.setupKey.length < 32) {
        errors.setupKey = 'Setup key must be at least 32 characters. Use the ADMIN_SETUP_KEY configured on the server.';
    }
    if (!values.username.trim()) {
        errors.username = 'Enter an admin username.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        errors.email = 'Enter a valid email address.';
    }
    if (values.password.length < 8) {
        errors.password = 'Password must be at least 8 characters.';
    }
    if (!values.department.trim()) {
        errors.department = 'Enter a department.';
    }
    if (!values.designation.trim()) {
        errors.designation = 'Enter a designation.';
    }

    if (Object.keys(errors).length) {
        showFormErrors(form, errors);
        return null;
    }

    return values;
}

function mapServerError(form, data, context) {
    if (data.fieldErrors && typeof data.fieldErrors === 'object') {
        showFormErrors(form, data.fieldErrors, data.message);
        return;
    }

    const message = data.message || 'Please check the highlighted information and try again.';
    const lowerMessage = message.toLowerCase();
    const errors = {};

    if (context === 'setup' && lowerMessage.includes('already been created')) {
        showFormErrors(form, {}, message);
        return;
    }

    if (context === 'setup' && lowerMessage.includes('setup key')) {
        errors.setupKey = message;
    } else if (context === 'setup' && lowerMessage.includes('not configured')) {
        showFormErrors(
            form,
            {},
            'Admin setup is disabled. Set ADMIN_SESSION_SECRET and ADMIN_SETUP_KEY in the server terminal, then restart npm start.'
        );
        return;
    } else if (context === 'setup' && lowerMessage.includes('server error')) {
        showFormErrors(
            form,
            {},
            'The server could not save the admin. Check the server terminal for its error and confirm MongoDB is running.'
        );
        return;
    } else if (context === 'admin-login' && lowerMessage.includes('credentials')) {
        errors.username = 'Check the admin username.';
        errors.email = 'Check the admin email address.';
        errors.password = 'The username, email, or password is incorrect.';
    } else if (lowerMessage.includes('already registered') || lowerMessage.includes('already exists') || lowerMessage.includes('already been')) {
        if (form.elements.namedItem('email')) {
            errors.email = 'This email may already be registered.';
        }
        if (form.elements.namedItem('username')) {
            errors.username = 'This username may already be registered.';
        }
        if (form.elements.namedItem('rollNumber')) {
            errors.rollNumber = 'This roll number may already be registered.';
        }
    } else if (lowerMessage.includes('email')) {
        errors.email = message;
    } else if (lowerMessage.includes('password')) {
        errors.password = message;
    } else if (lowerMessage.includes('department')) {
        errors.department = message;
    } else if (lowerMessage.includes('designation')) {
        errors.designation = message;
    }

    showFormErrors(form, errors, message);
}

function getAdminSetupConnectionMessage() {
    if (window.location.protocol === 'file:') {
        return 'This page was opened as a local file, so it cannot reach the API. Start the server with npm start and open http://localhost:5050.';
    }

    if (window.location.port && window.location.port !== '5050') {
        return `This page is served from ${window.location.origin}, not the app server. Start the app with npm start and open http://localhost:5050.`;
    }

    return 'Cannot reach the admin setup API. Confirm the server is running with npm start, MongoDB is running, and open the app at http://localhost:5050.';
}

// Function to handle user registration
async function registerUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearFormFeedback(form);

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const rollNumber = document.getElementById('roll-number').value.trim();
    const department = document.getElementById('user-department').value.trim();
    const casualLeave = Number(document.getElementById('casual-leave').value);
    const medicalLeave = Number(document.getElementById('medical-leave').value);

    const messageElement = document.getElementById('registration-feedback');
    const fieldErrors = {};

    if (!username) fieldErrors.username = 'Enter a username.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = 'Enter a valid email address.';
    if (!rollNumber) fieldErrors.rollNumber = 'Enter a roll number.';
    if (!department) fieldErrors.department = 'Enter a department.';
    if (!Number.isSafeInteger(casualLeave) || casualLeave < 0) {
        fieldErrors.casualLeave = 'Enter a non-negative whole number of casual leave days.';
    }
    if (!Number.isSafeInteger(medicalLeave) || medicalLeave < 0) {
        fieldErrors.medicalLeave = 'Enter a non-negative whole number of medical leave days.';
    }

    if (Object.keys(fieldErrors).length) {
        showFormErrors(form, fieldErrors);
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email,
                rollNumber,
                department,
                casualLeave,
                medicalLeave
            })
        });

        const data = await readResponse(response);

        if (response.ok) {
            messageElement.innerText = data.message || 'Registration successful! Please log in.';
            messageElement.classList.add('success');

            document.getElementById('registration-form').reset();
            document.getElementById('registration-section').style.display = 'none';
            document.getElementById('login-section').style.display = 'block';
        } else {
            mapServerError(form, data, 'student-registration');
        }
    } catch (error) {
        console.error('Error registering user:', error);
        showFormErrors(form, {}, 'Could not register the student. Check the server connection and try again.');
    }
}

// Function to handle user login
async function loginUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearFormFeedback(form);

    const email = document.getElementById('email').value.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFormErrors(form, { email: 'Enter a valid student email address.' });
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await readResponse(response);

        if (response.ok) {
            if (data.userId == null) {
                showFormErrors(form, {}, 'Student login failed because the server did not return a user ID. Please try again.');
                return;
            }

            userId = data.userId;

            document.getElementById('username-display').innerText =
                `${data.username ?? ''} (${data.department ?? 'General'})`;
            document.getElementById('roll-number-display').innerText =
                data.rollNumber ?? '';
            document.getElementById('casual-leave-display').innerText =
                data.casualLeave ?? 0;
            document.getElementById('medical-leave-display').innerText =
                data.medicalLeave ?? 0;

            document.getElementById('balance-section').style.display = 'block';
            document.getElementById('apply-leave-section').style.display = 'block';
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('registration-section').style.display = 'none';
            document.getElementById('logout-button').style.display = 'block';
            renderStudentLeaveRequests(data.leaveRequests);

            messageElement.innerText = data.message || 'Login successful.';
            document.getElementById('login-form').reset();
        } else {
            showFormErrors(form, { email: data.message || 'No student account was found with this email.' });
        }
    } catch (error) {
        console.error('Error logging in:', error);
        showFormErrors(form, {}, 'Could not log in. Check the server connection and try again.');
    }
}

async function loginAdmin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearFormFeedback(form);

    const email = document.getElementById('admin-email').value.trim();
    const username = document.getElementById('admin-login-username').value.trim();
    const password = document.getElementById('admin-password').value;

    const errors = {};
    if (!username) errors.username = 'Enter your admin username.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid admin email address.';
    if (!password) errors.password = 'Enter your admin password.';
    if (Object.keys(errors).length) {
        showFormErrors(form, errors);
        return;
    }

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        const data = await readResponse(response);

        if (!response.ok) {
            mapServerError(form, data, 'admin-login');
            return;
        }

        if (typeof data.token !== 'string' || !data.token) {
            showFormErrors(form, {}, 'Admin login failed because the server did not return a session. Please try again.');
            return;
        }

        adminToken = data.token;
        document.getElementById('admin-login-form').reset();
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('registration-section').style.display = 'none';
        document.getElementById('admin-login-section').style.display = 'none';
        document.getElementById('balance-section').style.display = 'none';
        document.getElementById('apply-leave-section').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
        document.getElementById('admin-profile').innerText =
            `${data.admin.username} — ${data.admin.department} (${data.admin.designation})`;
        document.getElementById('response-message').innerText = data.message || 'Admin login successful.';
        await Promise.all([loadAdminUsers(), loadAdminLeaveRequests()]);
    } catch (error) {
        console.error('Error during admin login:', error);
        showFormErrors(form, {}, 'Could not log in as admin. Check the server connection and try again.');
    }
}

async function createInitialAdmin(event) {
    event.preventDefault();
    const form = document.getElementById('admin-setup-form');
    clearFormFeedback(form);
    const details = validateAdminDetails(form, true);

    if (!details) {
        return;
    }

    try {
        const response = await fetch('/api/admin/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details)
        });
        const data = await readResponse(response);

        if (response.ok) {
            document.getElementById('response-message').innerText = data.message || 'Admin account created. You can now sign in.';
            document.getElementById('response-message').classList.add('success');
            form.reset();
            document.getElementById('show-admin-setup').style.display = 'none';
            showAdminLogin();
        } else {
            mapServerError(form, data, 'setup');
        }
    } catch (error) {
        console.error('Error creating initial admin:', error);
        showFormErrors(form, {}, getAdminSetupConnectionMessage());
    }
}

async function checkAdminSetupStatus() {
    const setupButton = document.getElementById('show-admin-setup');
    const statusElement = document.getElementById('admin-setup-status');

    try {
        const response = await fetch('/api/admin/setup-status');
        const data = await readResponse(response);

        if (response.ok && data.available === false) {
            setupButton.style.display = 'none';
            statusElement.innerText =
                'Initial admin is already created. Select Admin Login to sign in.';
            return;
        }

        setupButton.style.display = 'inline-block';
        statusElement.innerText = response.ok
            ? ''
            : `${data.message || 'Admin setup status is unavailable.'} Set ADMIN_SESSION_SECRET and ADMIN_SETUP_KEY in the server terminal, then restart npm start.`;
    } catch (error) {
        console.error('Error checking admin setup status:', error);
        setupButton.style.display = 'inline-block';
        statusElement.innerText =
            'Could not check admin setup. Ensure the server is running, configure ADMIN_SESSION_SECRET and ADMIN_SETUP_KEY, then restart npm start.';
    }
}

async function adminRequest(url, options = {}) {
    const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${adminToken}`
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers });
    const data = await readResponse(response);

    if (response.status === 401) {
        logoutAdmin();
    }

    return { response, data };
}

async function loadAdminUsers() {
    const messageElement = document.getElementById('admin-response-message');

    try {
        const { response, data } = await adminRequest('/api/admin/users');

        if (!response.ok) {
            messageElement.innerText = data.message || 'Error loading users.';
            return;
        }

        renderAdminUsers(data.users);
        messageElement.innerText = `${data.users.length} user(s) loaded.`;
    } catch (error) {
        console.error('Error loading admin users:', error);
        messageElement.innerText = 'Server error. Please try again.';
    }
}

async function refreshAdminDashboard() {
    await Promise.all([loadAdminUsers(), loadAdminLeaveRequests()]);
}

function renderAdminUsers(users) {
    const tableBody = document.getElementById('admin-users');
    tableBody.replaceChildren();

    for (const user of users) {
        const row = document.createElement('tr');
        row.dataset.userId = user._id;

        const fields = [
            ['username', user.username, 'text'],
            ['email', user.email, 'email'],
            ['rollNumber', user.rollNumber, 'text'],
            ['department', user.department || 'General', 'text'],
            ['casualLeave', user.casualLeave, 'number'],
            ['medicalLeave', user.medicalLeave, 'number']
        ];

        for (const [field, value, type] of fields) {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.className = `user-${field}`;
            input.type = type;
            input.value = value;
            input.setAttribute('aria-label', field);

            if (type === 'number') {
                input.min = '0';
                input.step = '1';
            }

            cell.append(input);
            row.append(cell);
        }

        const actions = document.createElement('td');
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn table-action';
        saveButton.dataset.action = 'save';
        saveButton.innerText = 'Save';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn table-action delete-button';
        deleteButton.dataset.action = 'delete';
        deleteButton.innerText = 'Delete';

        actions.append(saveButton, deleteButton);
        row.append(actions);
        tableBody.append(row);
    }
}

async function manageAdminUser(event) {
    const button = event.target.closest('button[data-action]');

    if (!button) {
        return;
    }

    const row = button.closest('tr');
    const userId = row.dataset.userId;
    const messageElement = document.getElementById('admin-response-message');

    if (button.dataset.action === 'delete') {
        if (!window.confirm('Delete this user and their leave balances?')) {
            return;
        }

        try {
            const { response, data } = await adminRequest(
                `/api/admin/users/${encodeURIComponent(userId)}`,
                { method: 'DELETE' }
            );

            messageElement.innerText = data.message || 'Error deleting user.';

            if (response.ok) {
                await loadAdminUsers();
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            messageElement.innerText = 'Server error. Please try again.';
        }

        return;
    }

    const updates = {
        username: row.querySelector('.user-username').value.trim(),
        email: row.querySelector('.user-email').value.trim(),
        rollNumber: row.querySelector('.user-rollNumber').value.trim(),
        department: row.querySelector('.user-department').value.trim(),
        casualLeave: row.querySelector('.user-casualLeave').valueAsNumber,
        medicalLeave: row.querySelector('.user-medicalLeave').valueAsNumber
    };

    if (
        !updates.username ||
        !updates.email ||
        !updates.rollNumber ||
        !updates.department ||
        !Number.isSafeInteger(updates.casualLeave) ||
        !Number.isSafeInteger(updates.medicalLeave) ||
        updates.casualLeave < 0 ||
        updates.medicalLeave < 0
    ) {
        messageElement.innerText = 'Enter valid user details and leave balances.';
        return;
    }

    try {
        const { response, data } = await adminRequest(
            `/api/admin/users/${encodeURIComponent(userId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify(updates)
            }
        );

        messageElement.innerText = data.message || 'Error updating user.';

        if (response.ok) {
            await loadAdminUsers();
        }
    } catch (error) {
        console.error('Error updating user:', error);
        messageElement.innerText = 'Server error. Please try again.';
    }
}

function addTableCell(row, value, label = '') {
    const cell = document.createElement('td');
    cell.textContent = value == null ? '' : String(value);
    if (label) {
        cell.dataset.label = label;
    }
    row.append(cell);
    return cell;
}

function renderStudentLeaveRequests(requests = []) {
    const tableBody = document.getElementById('student-leave-requests');
    tableBody.replaceChildren();

    for (const request of requests) {
        const row = document.createElement('tr');
        addTableCell(row, request.type, 'Type');
        addTableCell(row, request.days, 'Days');
        addTableCell(row, request.reason, 'Reason');
        addTableCell(row, new Date(request.createdAt).toLocaleString(), 'Submitted');
        addTableCell(row, request.status, 'Status');
        addTableCell(row, request.reviewNote, 'Admin note');
        tableBody.append(row);
    }
}

async function loadAdminLeaveRequests() {
    const messageElement = document.getElementById('admin-response-message');

    try {
        const { response, data } = await adminRequest('/api/admin/leave-requests');

        if (!response.ok) {
            messageElement.innerText = data.message || 'Error loading leave requests.';
            return;
        }

        renderAdminLeaveRequests(data.requests);
    } catch (error) {
        console.error('Error loading leave requests:', error);
        messageElement.innerText = 'Server error. Please try again.';
    }
}

function renderAdminLeaveRequests(requests = []) {
    const tableBody = document.getElementById('admin-leave-requests');
    tableBody.replaceChildren();

    for (const request of requests) {
        const row = document.createElement('tr');
        row.dataset.userId = request.userId;
        row.dataset.requestId = request.id;
        addTableCell(row, `${request.username} (${request.rollNumber})`, 'Student');
        addTableCell(row, request.department, 'Department');
        addTableCell(row, request.type, 'Leave type');
        addTableCell(row, request.days, 'Days requested');
        addTableCell(row, request.reason, 'Reason');
        addTableCell(row, new Date(request.createdAt).toLocaleString(), 'Submitted');
        addTableCell(row, request.status, 'Status');

        const noteCell = document.createElement('td');
        const note = document.createElement('input');
        note.type = 'text';
        note.maxLength = 500;
        note.placeholder = 'Optional note';
        note.value = request.reviewNote || '';
        note.setAttribute('aria-label', 'Admin review note');
        noteCell.dataset.label = 'Admin note';
        noteCell.append(note);
        row.append(noteCell);

        const actions = document.createElement('td');
        actions.dataset.label = 'Actions';
        if (request.status === 'pending') {
            for (const action of ['approve', 'disapprove']) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `btn table-action ${action === 'disapprove' ? 'delete-button' : ''}`;
                button.dataset.action = action;
                button.textContent = action === 'approve' ? 'Approve' : 'Disapprove';
                actions.append(button);
            }
        } else {
            actions.textContent = `Request ${request.status}.`;
        }

        row.append(actions);
        const feedbackCell = document.createElement('td');
        feedbackCell.colSpan = 9;
        const feedback = document.createElement('span');
        feedback.className = 'leave-action-feedback';
        feedback.setAttribute('role', 'status');
        feedbackCell.append(feedback);
        const feedbackRow = document.createElement('tr');
        feedbackRow.className = 'leave-feedback-row';
        feedbackRow.append(feedbackCell);
        tableBody.append(row);
        tableBody.append(feedbackRow);
    }
}

async function reviewLeaveRequest(event) {
    const button = event.target.closest('button[data-action]');

    if (!button) {
        return;
    }

    const row = button.closest('tr');
    const messageElement = document.getElementById('admin-response-message');
    const feedbackRow = row.nextElementSibling;
    const feedback = feedbackRow && feedbackRow.querySelector('.leave-action-feedback');
    const action = button.dataset.action;

    if (feedback) {
        feedback.textContent = action === 'approve'
            ? 'Approving leave request...'
            : 'Disapproving leave request...';
        feedback.classList.remove('error');
    }

    row.querySelectorAll('button[data-action]').forEach((actionButton) => {
        actionButton.disabled = true;
    });

    try {
        const { response, data } = await adminRequest(
            `/api/admin/leave-requests/${encodeURIComponent(row.dataset.userId)}/${encodeURIComponent(row.dataset.requestId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    action,
                    reviewNote: row.querySelector('input').value.trim()
                })
            }
        );

        if (!response.ok) {
            if (feedback) {
                feedback.textContent = data.message || 'Could not update this leave request.';
                feedback.classList.add('error');
            }
            messageElement.innerText = data.message || 'Could not update this leave request.';
            row.querySelectorAll('button[data-action]').forEach((actionButton) => {
                actionButton.disabled = false;
            });
            return;
        }

        if (feedback) {
            feedback.textContent = data.message || 'Leave request updated.';
        }
        messageElement.innerText = data.message || 'Leave request updated.';

        if (response.ok) {
            await Promise.all([loadAdminUsers(), loadAdminLeaveRequests()]);
            messageElement.innerText = data.message || 'Leave request updated.';
        }
    } catch (error) {
        console.error('Error reviewing leave request:', error);
        const errorMessage = 'Could not reach the server. Check your connection and try again.';
        if (feedback) {
            feedback.textContent = errorMessage;
            feedback.classList.add('error');
        }
        messageElement.innerText = errorMessage;
        row.querySelectorAll('button[data-action]').forEach((actionButton) => {
            actionButton.disabled = false;
        });
    }
}

async function createDepartmentAdmin(event) {
    event.preventDefault();
    const form = document.getElementById('create-admin-form');
    clearFormFeedback(form);
    const details = validateAdminDetails(form);

    if (!details) {
        return;
    }

    try {
        const { response, data } = await adminRequest('/api/admin/admins', {
            method: 'POST',
            body: JSON.stringify(details)
        });

        if (response.ok) {
            document.getElementById('create-admin-feedback').textContent =
                data.message || 'Admin account created successfully.';
            document.getElementById('create-admin-feedback').classList.add('success');
            form.reset();
        } else {
            mapServerError(form, data, 'create-admin');
        }
    } catch (error) {
        console.error('Error creating department admin:', error);
        showFormErrors(form, {}, 'Could not create the department admin. Check the server connection and try again.');
    }
}

function logoutAdmin() {
    adminToken = null;
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('admin-login-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('registration-section').style.display = 'none';
    document.getElementById('admin-users').replaceChildren();
    document.getElementById('admin-leave-requests').replaceChildren();
    document.getElementById('admin-response-message').innerText = '';
    document.getElementById('admin-profile').innerText = '';
}

// Function to handle user logout
function logoutUser() {
    userId = null;

    document.getElementById('balance-section').style.display = 'none';
    document.getElementById('apply-leave-section').style.display = 'none';
    document.getElementById('logout-button').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('registration-section').style.display = 'none';
    document.getElementById('admin-setup-section').style.display = 'none';
    document.getElementById('student-leave-requests').replaceChildren();

    document.getElementById('response-message').innerText = '';
    document.getElementById('registration-response').innerText = '';

    document.getElementById('username-display').innerText = '';
    document.getElementById('roll-number-display').innerText = '';
    document.getElementById('casual-leave-display').innerText = 'Loading...';
    document.getElementById('medical-leave-display').innerText = 'Loading...';

    document.getElementById('login-form').reset();
    document.getElementById('leave-form').reset();
}

// Function to refresh leave balance
async function refreshLeaveBalance() {
    if (userId == null) {
        document.getElementById('response-message').innerText =
            'Please log in first.';
        return;
    }

    try {
        const response = await fetch(
            `/api/leave-balance/${encodeURIComponent(userId)}`
        );

        const data = await readResponse(response);

        if (response.ok) {
            document.getElementById('casual-leave-display').innerText =
                data.casualLeave ?? 0;
            document.getElementById('medical-leave-display').innerText =
                data.medicalLeave ?? 0;
            renderStudentLeaveRequests(data.leaveRequests);
            document.getElementById('response-message').innerText =
                data.message || 'Leave balance updated.';
        } else {
            document.getElementById('response-message').innerText =
                data.message || 'Error fetching leave balance.';
        }
    } catch (error) {
        console.error('Error refreshing balance:', error);
        document.getElementById('response-message').innerText =
            'Server error. Please try again.';
    }
}

// Function to apply for leave
async function applyLeave(event) {
    event.preventDefault();

    if (userId == null) {
        document.getElementById('response-message').innerText =
            'Please log in before applying for leave.';
        return;
    }

    const type = document.getElementById('leave-type').value;
    const days = Number(document.getElementById('leave-days').value);
    const reason = document.getElementById('leave-reason').value.trim();
    const messageElement = document.getElementById('response-message');

    if (!type || !Number.isInteger(days) || days <= 0 || !reason) {
        messageElement.innerText =
            'Please select a leave type, enter valid days, and provide a reason.';
        return;
    }

    try {
        const response = await fetch(
            `/api/apply-leave/${encodeURIComponent(userId)}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type, days, reason })
            }
        );

        const data = await readResponse(response);

        if (response.ok) {
            document.getElementById('casual-leave-display').innerText =
                data.casualLeave ?? 0;
            document.getElementById('medical-leave-display').innerText =
                data.medicalLeave ?? 0;
            renderStudentLeaveRequests(data.leaveRequests);

            messageElement.innerText =
                data.message || 'Leave request submitted for admin review.';

            document.getElementById('leave-form').reset();
        } else {
            messageElement.innerText =
                data.message || 'Error applying for leave.';
        }
    } catch (error) {
        console.error('Error applying for leave:', error);
        messageElement.innerText = 'Server error. Please try again.';
    }
}

// Show the login section
function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('registration-section').style.display = 'none';
    document.getElementById('admin-login-section').style.display = 'none';
    document.getElementById('admin-setup-section').style.display = 'none';
}

// Show the registration section
function showRegistration() {
    document.getElementById('registration-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-login-section').style.display = 'none';
    document.getElementById('admin-setup-section').style.display = 'none';
}

function showAdminLogin() {
    document.getElementById('admin-login-section').style.display = 'block';
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('registration-section').style.display = 'none';
    document.getElementById('admin-setup-section').style.display = 'none';
}

function showAdminSetup() {
    document.getElementById('admin-setup-section').style.display = 'block';
    document.getElementById('admin-login-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('registration-section').style.display = 'none';
}

// Register event listeners after the HTML has loaded
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('registration-form')
        .addEventListener('submit', registerUser);

    document.getElementById('login-form')
        .addEventListener('submit', loginUser);

    document.getElementById('admin-login-form')
        .addEventListener('submit', loginAdmin);

    document.getElementById('admin-setup-form')
        .addEventListener('submit', createInitialAdmin);

    document.getElementById('refresh-balance')
        .addEventListener('click', refreshLeaveBalance);

    document.getElementById('logout-button')
        .addEventListener('click', logoutUser);

    document.getElementById('leave-form')
        .addEventListener('submit', applyLeave);

    document.getElementById('show-login')
        .addEventListener('click', showLogin);

    document.getElementById('show-registration')
        .addEventListener('click', showRegistration);

    document.getElementById('show-admin-login')
        .addEventListener('click', showAdminLogin);

    document.getElementById('show-admin-setup')
        .addEventListener('click', showAdminSetup);

    document.getElementById('back-to-login')
        .addEventListener('click', showLogin);

    document.getElementById('back-from-setup')
        .addEventListener('click', showLogin);

    document.getElementById('admin-logout-button')
        .addEventListener('click', logoutAdmin);

    document.getElementById('refresh-users')
        .addEventListener('click', refreshAdminDashboard);

    document.getElementById('admin-users')
        .addEventListener('click', manageAdminUser);

    document.getElementById('admin-leave-requests')
        .addEventListener('click', reviewLeaveRequest);

    document.getElementById('create-admin-form')
        .addEventListener('submit', createDepartmentAdmin);

    for (const form of document.querySelectorAll('form')) {
        form.addEventListener('input', (event) => {
            const field = event.target;
            if (!field.name) {
                return;
            }

            field.classList.remove('input-error');
            field.removeAttribute('aria-invalid');
            const errorElement = [...form.querySelectorAll('.field-error')]
                .find((element) => element.dataset.errorFor === field.name);
            if (errorElement) {
                errorElement.textContent = '';
            }
        });
    }

    checkAdminSetupStatus();
});