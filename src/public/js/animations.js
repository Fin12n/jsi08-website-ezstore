document.addEventListener('DOMContentLoaded', () => {
  // Select all premium elements to animate
  const animateElements = document.querySelectorAll('.card, .glass-card, .admin-card, .metric-card, .section-title, .admin-header, .auth-card, table tbody tr');
  
  // Apply hidden state initially
  animateElements.forEach((el, index) => {
    el.classList.add('premium-anim-hidden');
    // Stagger effect for table rows or adjacent cards
    if (el.tagName.toLowerCase() === 'tr' || el.classList.contains('metric-card')) {
      el.style.transitionDelay = `${(index % 10) * 0.05}s`;
    }
  });

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add a slight delay for visual smoothness before triggering
        requestAnimationFrame(() => {
          entry.target.classList.add('premium-anim-visible');
        });
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  animateElements.forEach(el => observer.observe(el));

  // Chatbot wobble interaction on load
  const chatbotBtn = document.getElementById('chatbot-toggle');
  if (chatbotBtn) {
    setTimeout(() => {
      chatbotBtn.classList.add('wobble-once');
      chatbotBtn.addEventListener('animationend', () => {
        chatbotBtn.classList.remove('wobble-once');
      });
    }, 2000);
  }
});
