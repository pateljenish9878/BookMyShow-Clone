module.exports = (req, res, next) => {
  if (req.session.adminUser) {
    req.adminUser = req.session.adminUser;
    return next();
  }
  res.redirect('/admin/login');
}; 