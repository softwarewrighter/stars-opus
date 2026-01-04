// Star Quiz Application
(function() {
    'use strict';

    // State
    let stars = [];
    let namedStars = [];
    let canvas, ctx;
    let viewState = {
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
        minZoom: 0.5,
        maxZoom: 10
    };
    let isDragging = false;
    let didDrag = false;
    let dragStart = { x: 0, y: 0 };
    let showGrid = false;
    let maxMagnitude = 6;
    let score = { correct: 0, total: 0 };
    let quizActive = false;
    let currentQuizStar = null;

    // DOM Elements
    const elements = {};

    // Initialize the application
    async function init() {
        cacheElements();
        setupCanvas();
        setupEventListeners();
        await loadStarData();
        render();
    }

    function cacheElements() {
        elements.canvas = document.getElementById('starfield');
        elements.quizPopup = document.getElementById('quiz-popup');
        elements.quizOptions = document.getElementById('quiz-options');
        elements.quizFeedback = document.getElementById('quiz-feedback');
        elements.gridToggle = document.getElementById('grid-toggle');
        elements.magFilter = document.getElementById('mag-filter');
        elements.magValue = document.getElementById('mag-value');
        elements.correctCount = document.getElementById('correct-count');
        elements.totalCount = document.getElementById('total-count');
        elements.percentage = document.getElementById('percentage');
        elements.doneBtn = document.getElementById('done-btn');
        elements.restartBtn = document.getElementById('restart-btn');
        elements.results = document.getElementById('results');
        elements.resultsText = document.getElementById('results-text');
        elements.loading = document.getElementById('loading');
        elements.zoomIn = document.getElementById('zoom-in');
        elements.zoomOut = document.getElementById('zoom-out');
        elements.resetView = document.getElementById('reset-view');
    }

    function setupCanvas() {
        canvas = elements.canvas;
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width - 280; // Subtract controls panel width
        canvas.height = rect.height;

        // Center the view initially
        viewState.offsetX = canvas.width / 2;
        viewState.offsetY = canvas.height / 2;

        render();
    }

    function setupEventListeners() {
        // Canvas events
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('click', onClick);

        // Control events
        elements.gridToggle.addEventListener('change', (e) => {
            showGrid = e.target.checked;
            render();
        });

        elements.magFilter.addEventListener('input', (e) => {
            maxMagnitude = parseFloat(e.target.value);
            elements.magValue.textContent = maxMagnitude;
            render();
        });

        elements.zoomIn.addEventListener('click', () => {
            viewState.zoom = Math.min(viewState.zoom * 1.5, viewState.maxZoom);
            render();
        });

        elements.zoomOut.addEventListener('click', () => {
            viewState.zoom = Math.max(viewState.zoom / 1.5, viewState.minZoom);
            render();
        });

        elements.resetView.addEventListener('click', () => {
            viewState.zoom = 1;
            viewState.offsetX = canvas.width / 2;
            viewState.offsetY = canvas.height / 2;
            render();
        });

        elements.doneBtn.addEventListener('click', showResults);
        elements.restartBtn.addEventListener('click', restartQuiz);
    }

    // Load and parse star data
    async function loadStarData() {
        try {
            const response = await fetch('data/named_stars.csv.gz');
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const decompressed = pako.inflate(uint8Array, { to: 'string' });

            parseCSV(decompressed);
            elements.loading.classList.add('hidden');
        } catch (error) {
            console.error('Error loading star data:', error);
            elements.loading.textContent = 'Error loading star data. Please check console.';
        }
    }

    function parseCSV(csvString) {
        const lines = csvString.split('\n');
        const headers = parseCSVLine(lines[0]);

        const idxId = headers.indexOf('id');
        const idxProper = headers.indexOf('proper');
        const idxRa = headers.indexOf('ra');
        const idxDec = headers.indexOf('dec');
        const idxMag = headers.indexOf('mag');
        const idxDist = headers.indexOf('dist');
        const idxCon = headers.indexOf('con');
        const idxBf = headers.indexOf('bf');

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = parseCSVLine(lines[i]);
            const star = {
                id: parseInt(values[idxId]) || i,
                name: values[idxProper] || '',
                ra: parseFloat(values[idxRa]) || 0,
                dec: parseFloat(values[idxDec]) || 0,
                mag: parseFloat(values[idxMag]) || 10,
                dist: parseFloat(values[idxDist]) || 0,
                con: values[idxCon] || '',
                bf: values[idxBf] || ''
            };

            // All stars in named_stars.csv are named
            stars.push(star);
            namedStars.push(star);
        }

        console.log(`Loaded ${namedStars.length} named stars`);
    }

    function parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }

    // Convert RA/Dec to canvas coordinates
    function starToCanvas(star) {
        // RA: 0-24 hours -> 0 to width
        // Dec: -90 to +90 degrees -> height to 0
        const baseWidth = 1000;
        const baseHeight = 500;

        const x = (star.ra / 24) * baseWidth;
        const y = ((90 - star.dec) / 180) * baseHeight;

        return {
            x: x * viewState.zoom + viewState.offsetX - (baseWidth * viewState.zoom / 2),
            y: y * viewState.zoom + viewState.offsetY - (baseHeight * viewState.zoom / 2)
        };
    }

    // Get star radius based on magnitude
    function getStarRadius(mag, isNamed) {
        // Brighter stars (lower magnitude) are larger
        // Magnitude range roughly -1 to 10
        const baseRadius = Math.max(0.5, 4 - (mag * 0.3));
        const zoomAdjusted = baseRadius * Math.sqrt(viewState.zoom);
        // Named stars get a slight boost
        return isNamed ? zoomAdjusted * 1.2 : zoomAdjusted;
    }

    // Rendering
    function render() {
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw grid if enabled
        if (showGrid) {
            drawGrid();
        }

        // Draw stars
        drawStars();
    }

    function drawGrid() {
        ctx.strokeStyle = '#1a3a5c';
        ctx.lineWidth = 1;

        const baseWidth = 1000;
        const baseHeight = 500;

        // RA lines (every 2 hours)
        for (let ra = 0; ra <= 24; ra += 2) {
            const x = (ra / 24) * baseWidth * viewState.zoom + viewState.offsetX - (baseWidth * viewState.zoom / 2);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#4a6a8c';
            ctx.font = '12px sans-serif';
            ctx.fillText(`${ra}h`, x + 5, 15);
        }

        // Dec lines (every 30 degrees)
        for (let dec = -90; dec <= 90; dec += 30) {
            const y = ((90 - dec) / 180) * baseHeight * viewState.zoom + viewState.offsetY - (baseHeight * viewState.zoom / 2);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#4a6a8c';
            ctx.fillText(`${dec}°`, 5, y - 5);
        }
    }

    function drawStars() {
        // Draw all named stars with glow effect
        for (const star of namedStars) {
            if (star.mag > maxMagnitude) continue;

            const pos = starToCanvas(star);
            if (pos.x < -10 || pos.x > canvas.width + 10 ||
                pos.y < -10 || pos.y > canvas.height + 10) continue;

            const radius = getStarRadius(star.mag, true);

            // Glow effect
            const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 2);
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(0.5, 'rgba(200, 220, 255, 0.5)');
            gradient.addColorStop(1, 'rgba(100, 150, 255, 0)');

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius * 2, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
        }
    }

    // Mouse/Touch handlers
    function onMouseDown(e) {
        if (quizActive) return;
        isDragging = true;
        didDrag = false;
        dragStart.x = e.clientX - viewState.offsetX;
        dragStart.y = e.clientY - viewState.offsetY;
        canvas.style.cursor = 'grabbing';
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        didDrag = true;
        viewState.offsetX = e.clientX - dragStart.x;
        viewState.offsetY = e.clientY - dragStart.y;
        render();
    }

    function onMouseUp() {
        isDragging = false;
        canvas.style.cursor = 'grab';
    }

    function onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = viewState.zoom * delta;

        if (newZoom >= viewState.minZoom && newZoom <= viewState.maxZoom) {
            // Zoom towards mouse position
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            viewState.offsetX = mouseX - (mouseX - viewState.offsetX) * delta;
            viewState.offsetY = mouseY - (mouseY - viewState.offsetY) * delta;
            viewState.zoom = newZoom;
            render();
        }
    }

    function onClick(e) {
        if (didDrag) return;
        if (quizActive) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Find clicked star
        let clickedStar = null;
        let minDist = Infinity;

        for (const star of namedStars) {
            if (star.mag > maxMagnitude) continue;

            const pos = starToCanvas(star);
            const radius = getStarRadius(star.mag, true);
            const dist = Math.sqrt((pos.x - clickX) ** 2 + (pos.y - clickY) ** 2);

            const hitRadius = Math.max(radius * 3, 15); // Minimum 15px hit area
            if (dist < hitRadius && dist < minDist) {
                minDist = dist;
                clickedStar = star;
            }
        }

        if (clickedStar) {
            showQuiz(clickedStar);
        }
    }

    // Quiz functionality
    function showQuiz(star) {
        quizActive = true;
        currentQuizStar = star;

        // Get 3 wrong answers (nearby or similar stars)
        const wrongAnswers = getWrongAnswers(star, 3);
        const allOptions = [star, ...wrongAnswers];

        // Shuffle options
        shuffleArray(allOptions);

        // Build quiz UI
        elements.quizOptions.innerHTML = '';
        elements.quizFeedback.classList.add('hidden');
        elements.quizFeedback.className = 'hidden';

        allOptions.forEach((option, index) => {
            const div = document.createElement('div');
            div.className = 'quiz-option';
            div.innerHTML = `
                <input type="radio" name="star-answer" id="option-${index}" value="${option.id}">
                <label for="option-${index}">${option.name}</label>
            `;
            div.addEventListener('click', () => checkAnswer(option, div));
            elements.quizOptions.appendChild(div);
        });

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-popup';
        closeBtn.textContent = 'Skip';
        closeBtn.addEventListener('click', closeQuiz);
        elements.quizOptions.appendChild(closeBtn);

        elements.quizPopup.classList.remove('hidden');
    }

    function getWrongAnswers(correctStar, count) {
        // Find nearby stars by RA/Dec distance
        const candidates = namedStars
            .filter(s => s.id !== correctStar.id && s.mag <= maxMagnitude)
            .map(s => ({
                star: s,
                distance: Math.sqrt(
                    Math.pow(s.ra - correctStar.ra, 2) +
                    Math.pow(s.dec - correctStar.dec, 2)
                )
            }))
            .sort((a, b) => a.distance - b.distance);

        // Take some nearby and some random for variety
        const nearby = candidates.slice(0, 10);
        const random = candidates.slice(10);
        shuffleArray(random);

        const pool = [...nearby, ...random.slice(0, 10)];
        shuffleArray(pool);

        return pool.slice(0, count).map(c => c.star);
    }

    function checkAnswer(selectedStar, optionElement) {
        const isCorrect = selectedStar.id === currentQuizStar.id;

        // Disable all options
        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.add('disabled');
        });

        // Show correct/incorrect styling
        optionElement.classList.add(isCorrect ? 'correct' : 'incorrect');

        // If wrong, also highlight the correct answer
        if (!isCorrect) {
            document.querySelectorAll('.quiz-option').forEach(opt => {
                const radio = opt.querySelector('input');
                if (parseInt(radio.value) === currentQuizStar.id) {
                    opt.classList.add('correct');
                }
            });
        }

        // Show feedback
        elements.quizFeedback.classList.remove('hidden');
        elements.quizFeedback.className = isCorrect ? 'correct' : 'incorrect';
        elements.quizFeedback.innerHTML = isCorrect
            ? '<span class="feedback-icon">&#x2714;</span> Correct!'
            : `<span class="feedback-icon">&#x2718;</span> Incorrect! It was ${currentQuizStar.name}`;

        // Update score
        score.total++;
        if (isCorrect) score.correct++;
        updateScoreDisplay();

        // Update close button
        const closeBtn = document.getElementById('close-popup');
        closeBtn.textContent = 'Continue';

        // Auto-close after delay
        setTimeout(closeQuiz, 2000);
    }

    function closeQuiz() {
        quizActive = false;
        currentQuizStar = null;
        elements.quizPopup.classList.add('hidden');
    }

    function updateScoreDisplay() {
        elements.correctCount.textContent = score.correct;
        elements.totalCount.textContent = score.total;
        const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        elements.percentage.textContent = `(${pct}%)`;
    }

    function showResults() {
        const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        let message = `You got ${score.correct} out of ${score.total} correct (${pct}%)`;

        if (pct >= 90) {
            message += '<br><br>Excellent! You really know your stars!';
        } else if (pct >= 70) {
            message += '<br><br>Great job! Keep practicing!';
        } else if (pct >= 50) {
            message += '<br><br>Good effort! The night sky awaits!';
        } else if (score.total > 0) {
            message += '<br><br>Keep exploring the cosmos!';
        } else {
            message = 'Click on stars to start the quiz!';
        }

        elements.resultsText.innerHTML = message;
        elements.results.classList.remove('hidden');
        elements.doneBtn.classList.add('hidden');
    }

    function restartQuiz() {
        score.correct = 0;
        score.total = 0;
        updateScoreDisplay();
        elements.results.classList.add('hidden');
        elements.doneBtn.classList.remove('hidden');
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
