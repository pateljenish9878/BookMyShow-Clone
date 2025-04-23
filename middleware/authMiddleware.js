// Middleware to check if user is authenticated as admin
module.exports = (req, res, next) => {
  // Check specifically for admin session
  if (req.session.adminUser) {
    // Set req.adminUser instead of req.user to avoid confusion with frontend user
    req.adminUser = req.session.adminUser;
    return next();
  }
  res.redirect('/admin/login');
}; 