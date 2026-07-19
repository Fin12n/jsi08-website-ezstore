/* ==========================================================================
   EZ ASSISTANT - AI CHATBOT LOGIC & PARTICLES ANIMATION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const chatbotToggle = document.getElementById('chatbot-toggle');
  const chatbotContainer = document.getElementById('chatbot-container');
  const chatbotClose = document.getElementById('chatbot-close');
  const chatbotForm = document.getElementById('chatbot-form');
  const chatbotInput = document.getElementById('chatbot-input');
  const chatbotMessages = document.getElementById('chatbot-messages');
  const chatbotPulse = document.getElementById('chatbot-pulse');
  const quickReplyButtons = document.querySelectorAll('.chatbot-reply-btn');
  const particlesCanvas = document.getElementById('chatbot-particles');

  // Toggle Chat Box
  if (chatbotToggle && chatbotContainer) {
    chatbotToggle.addEventListener('click', () => {
      chatbotContainer.classList.add('active');
      chatbotToggle.style.display = 'none';
      if (chatbotPulse) chatbotPulse.style.display = 'none'; // Hide notification pulse on open
      scrollToBottom();
      chatbotInput.focus();
    });
  }

  if (chatbotClose && chatbotContainer && chatbotToggle) {
    chatbotClose.addEventListener('click', () => {
      chatbotContainer.classList.remove('active');
      chatbotToggle.style.display = 'flex';
    });
  }

  // Quick Replies Click Handler
  quickReplyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.getAttribute('data-reply');
      sendMessage(question);
    });
  });

  // Form Submit Handler
  if (chatbotForm) {
    chatbotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const messageText = chatbotInput.value.trim();
      if (messageText === '') return;
      sendMessage(messageText);
    });
  }

  // Send Message function
  async function sendMessage(text) {
    // Append User Message
    appendMessage(text, 'user');
    chatbotInput.value = '';
    
    // Show Typing Indicator
    const indicator = showTypingIndicator();
    scrollToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: text })
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      
      // Remove Typing Indicator
      indicator.remove();

      // Append Bot Reply with typing effect
      appendMessage(data.reply, 'bot', true);

    } catch (error) {
      console.error('❌ Chatbot Error:', error);
      indicator.remove();
      appendMessage('Xin lỗi bạn, hệ thống đang bận một chút. Bạn vui lòng thử lại sau nhé! 😢', 'bot');
    }
    scrollToBottom();
  }

  // Append Message Markup
  function appendMessage(text, sender, useTypingEffect = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('chatbot-message');
    msgDiv.classList.add(sender === 'user' ? 'chatbot-message-user' : 'chatbot-message-bot');
    
    if (sender === 'bot' && useTypingEffect) {
      chatbotMessages.appendChild(msgDiv);
      typeText(msgDiv, text);
    } else {
      msgDiv.textContent = text;
      chatbotMessages.appendChild(msgDiv);
    }
  }

  // Typewriter effect
  function typeText(element, text) {
    let index = 0;
    element.textContent = '';
    const speed = 15; // ms per character

    function type() {
      if (index < text.length) {
        element.textContent += text.charAt(index);
        index++;
        scrollToBottom();
        setTimeout(type, speed);
      }
    }
    type();
  }

  // Typing Indicator Markup
  function showTypingIndicator() {
    const indicatorDiv = document.createElement('div');
    indicatorDiv.classList.add('chatbot-typing-indicator');
    indicatorDiv.innerHTML = `
      <div class="chatbot-dot"></div>
      <div class="chatbot-dot"></div>
      <div class="chatbot-dot"></div>
    `;
    chatbotMessages.appendChild(indicatorDiv);
    return indicatorDiv;
  }

  // Helper Scroll to bottom
  function scrollToBottom() {
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }


  // ==========================================================================
  // CANVAS PARTICLES ANIMATION
  // ==========================================================================
  if (particlesCanvas) {
    const ctx = particlesCanvas.getContext('2d');
    let particlesArray = [];
    const numberOfParticles = 40;
    
    const mouse = {
      x: null,
      y: null,
      radius: 60
    };

    // Track mouse movement inside container
    chatbotContainer.addEventListener('mousemove', (e) => {
      const rect = particlesCanvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    chatbotContainer.addEventListener('mouseleave', () => {
      mouse.x = null;
      mouse.y = null;
    });

    // Resize Canvas size
    function resizeCanvas() {
      const rect = chatbotContainer.getBoundingClientRect();
      particlesCanvas.width = rect.width;
      particlesCanvas.height = rect.height;
    }
    resizeCanvas();
    
    // Handle container active resize
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(chatbotContainer);

    // Particle Class
    class Particle {
      constructor() {
        this.x = Math.random() * particlesCanvas.width;
        this.y = Math.random() * particlesCanvas.height;
        this.size = Math.random() * 3 + 1.5;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.speedY = Math.random() * 0.4 - 0.2;
        this.baseColor = Math.random() > 0.5 ? '154, 91, 237' : '51, 203, 255'; // Purple or blue
      }

      draw() {
        ctx.fillStyle = `rgba(${this.baseColor}, 0.55)`;
        ctx.shadowBlur = 4;
        ctx.shadowColor = `rgba(${this.baseColor}, 0.5)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        // Bounce borders
        if (this.x < 0 || this.x > particlesCanvas.width) this.speedX = -this.speedX;
        if (this.y < 0 || this.y > particlesCanvas.height) this.speedY = -this.speedY;

        // Mouse attraction/repulsion interaction
        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < mouse.radius) {
            const forceDirectionX = dx / distance;
            const forceDirectionY = dy / distance;
            const maxDistance = mouse.radius;
            const force = (maxDistance - distance) / maxDistance;
            
            // Push particles away from mouse
            this.x -= forceDirectionX * force * 1.5;
            this.y -= forceDirectionY * force * 1.5;
          }
        }
      }
    }

    // Initialize Particle Array
    function init() {
      particlesArray = [];
      for (let i = 0; i < numberOfParticles; i++) {
        particlesArray.push(new Particle());
      }
    }
    init();

    // Loop animation
    function animate() {
      ctx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);
      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
      }
      requestAnimationFrame(animate);
    }
    animate();
  }
});
