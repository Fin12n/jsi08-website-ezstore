document.addEventListener('DOMContentLoaded', () => {
  // 1. Dynamic Scroll Navbar styling
  const navbar = document.querySelector('.glass-navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.background = 'rgba(10, 15, 30, 0.9)';
        navbar.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
        navbar.style.padding = '8px 0';
      } else {
        navbar.style.background = 'rgba(10, 15, 30, 0.7)';
        navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.15)';
        navbar.style.padding = '12px 0';
      }
    });
  }

  // 2. Alert auto-dismiss timer
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    setTimeout(() => {
      // Fade out effect
      alert.style.transition = 'opacity 0.5s ease';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 4000);
  });

  // 3. Client-side Form Validation helpers
  const registerForm = document.querySelector('form[action="/register"]');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      if (password !== confirmPassword) {
        e.preventDefault();
        alert('Mật khẩu xác nhận không khớp! Vui lòng kiểm tra lại.');
      }
    });
  }
});
