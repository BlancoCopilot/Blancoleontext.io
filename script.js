document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value; // Assuming there's an input with id 'password'

    // Simple visual feedback
    const button = this.querySelector('button');

    if (username === 'Hectorblanco' && password === '19042007') {
        button.innerText = 'Entrando...';
        button.style.opacity = '0.7';

        setTimeout(() => {
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        }, 500);
    } else {
        alert('Usuario o contraseña incorrectos');
    }
});
