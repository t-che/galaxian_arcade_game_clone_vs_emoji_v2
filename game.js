const PLAYER_SPEED = 5;
const BULLET_SPEED = 5;
const ENEMY_SPEED = 1;
const FORMATION_SPEED = ENEMY_SPEED * 0.5;
const BOSS_SPEED = ENEMY_SPEED * 2;
const BONUS_SPEED = 3;
const METEOR_SPEED = 3;
const ENEMY_ROWS = 9;
const ENEMY_COLS_MOBILE = 9;
const ENEMY_COLS_DESKTOP = 10;
const ENEMY_DIVE_PROB = 0.015;
const BONUS_THRESHOLD = 50;
const EXPLOSION_DURATION = 500;
const BOSS_BLINK_DURATION = 300;
const PLAYER_BLINK_DURATION = 300;
const BOSS_STOP_DURATION = 3000;
const BOSS_STOP_INTERVAL = 5000;
const BOSS_ATTACK_INTERVAL = 1000;
const UNLIMITED_SHOOTING_DURATION = Infinity; // Бесконечная стрельба до потери жизни
const INVINCIBILITY_DURATION = 45000; // 45 секунд
const BONUS_SPAWN_START = 15; // 15 секунд
const BONUS_SPAWN_END = 90; // 90 секунд
const BONUS_SPAWN_PROB = 0.05; // Вероятность спавна бонусов
const LEVEL_COMPLETE_DURATION = 2000;
const COUNTDOWN_DURATION = 3000;
const METEOR_SPAWN_DELAY = 10;
const METEOR_SPAWN_PROB = 0.005;
const MAX_METEORS = 3;
const TOTAL_METEORS_PER_LEVEL = 10;

// Состояние игры
let canvas, ctx, $canvas, $container;
let player = {
    x: 0, y: 0, width: 20, height: 20, emoji: '🚀', lives: 3,
    movingLeft: false, movingRight: false, direction: 'right',
    unlimitedShooting: false, bulletColor: '🔵', blinkTimer: 0, invincibility: false, invincibilityTimer: 0
};
let enemies = [], bullets = [], bonuses = [], explosions = [], meteors = [];
let boss = null, gameState = 'start', score = 0, level = 1, gameTime = 0;
let specialBonuses = 0, enemiesKilled = 0, meteorsSpawned = 0, invincibilityBonusesSpawned = 0;
let formationDirection = 1, formationX = 0, diveCooldown = 0;
let bonusSpawnedThisLevel = false, pigBonusSpawned = false, secondBonusSpawned = false;
let levelCompleteTimer = 0, countdownTimer = 0;
let isPaused = false;
const bonusOrder = ['✨', '🐽', '🌪'];
let currentBonusIndex = 0;
let lastScoreForInvincibility = 0; // Для отслеживания последнего порога очков для 🐢

// Эмодзи и цвета бонусов
const enemyEmojis = ['🦋', '🧚‍♀️', '🧚‍♂️', '🧚', '🪰', '🪲', '🪳', '🐞', '🐝', '🦜'];
const bossEmojis = ['☃️', '👾', '🦜'];
const bonusColors = {
    '❤️': '#ff0000',
    '✨': '#ffd700',
    '🐽': '#ff69b4',
    '🐢': '#008000',
    '🌪': '#00b7eb'
};

// Инициализация
function init() {
    if (typeof jQuery === 'undefined') {
        console.error('jQuery is not loaded');
        return;
    }

    const $ui = {
        score: $('#score'),
        lives: $('#lives'),
        level: $('#level'),
        bossLives: $('#bossLives'),
        time: $('#time'),
        gameCanvas: $('.game-canvas'),
        startModal: $('#startModal'),
        pauseModal: $('#pauseModal'),
        resultModal: $('#resultsModal'),
        resultName: $('#resultName'),
        resultTime: $('#resultTime'),
        resultBonus: $('#resultBonus'),
        resultSpecial: $('#resultSpecial'),
        resultLevels: $('#resultLevels'),
        playerName: $('#playerName')
    };

    for (const [key, $element] of Object.entries($ui)) {
        if (!$element.length) {
            console.error(`UI element #${key} not found in DOM`);
        }
    }

    canvas = $('#gameCanvas')[0];
    $container = $('#gameCanvasContainer');
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        console.error('Canvas element (#gameCanvas) not found');
        return;
    }
    if (!$container.length) {
        console.error('Container element (#gameCanvasContainer) not found');
        return;
    }

    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Failed to get 2D context for canvas');
        return;
    }

    $canvas = $(canvas);
    resizeCanvas();
    $(window).on('resize', resizeCanvas);
    setupEventListeners();
    updateGameTime();

    const savedEmoji = localStorage.getItem('playerEmoji');
    if (savedEmoji) {
        player.emoji = savedEmoji;
        $('.character-select button').filter(function() { return $(this).text() === savedEmoji; }).addClass('selected');
    }

    $('#startButton').on('click', startGame);
    $('#startBossButton').on('click', startBossMode);
    console.log('Game initialized');
}

// Адаптация размера canvas
function resizeCanvas() {
    if (!canvas || !$container) return;
    const wasHidden = $container.is(':hidden');
    if (wasHidden) $container.show();
    const width = $container.width(), height = $container.height();
    if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
        player.x = width / 2 - player.width / 2;
        player.y = height - player.height - 20;
    }
    if (wasHidden && gameState !== 'playing') $container.hide();
}

// Настройка событий
function setupEventListeners() {
    $(document).on('keydown', e => {
        if (gameState !== 'playing') return;
        if (e.code === 'ArrowLeft') player.movingLeft = true, player.direction = 'left';
        if (e.code === 'ArrowRight') player.movingRight = true, player.direction = 'right';
        if (e.code === 'Space') shootBullet();
        if (e.code === 'KeyP') showModal('pause');
    }).on('keyup', e => {
        if (e.code === 'ArrowLeft') player.movingLeft = false;
        if (e.code === 'ArrowRight') player.movingRight = false;
    });

    $('#moveLeft').on('touchstart', () => { player.movingLeft = true; player.direction = 'left'; })
                  .on('touchend', () => { player.movingLeft = false; });
    $('#moveRight').on('touchstart', () => { player.movingRight = true; player.direction = 'right'; })
                   .on('touchend', () => { player.movingRight = false; });
    $('#fire').on('touchstart', e => { e.preventDefault(); shootBullet(); });
}

// Стрельба пулей
function shootBullet() {
    const isMobile = canvas.width < 600;
    const bulletSize = isMobile ? 5 : 10;
    const playerBullets = bullets.filter(b => b.player);
    if (playerBullets.length < (player.unlimitedShooting ? 3 : 1)) {
        bullets.push({
            x: player.x + player.width / 2 - bulletSize / 2,
            y: player.y,
            width: bulletSize,
            height: bulletSize,
            emoji: player.bulletColor,
            player: true
        });
    }
}

// Старт игры
function startGame() {
    if (!canvas || !ctx) {
        console.error('Canvas or context not initialized');
        return;
    }
    playerName = $('#playerName').val() || 'Player';
    localStorage.setItem('playerName', playerName);
    resetGame();
    $('#startModal').removeClass('active');
    $('.game-canvas').addClass('active');
    resizeCanvas();
    spawnEnemies();
    updateUI();
    gameState = 'playing';
    console.log('Game started');
    requestAnimationFrame(gameLoop);
}

// Старт режима босса
function startBossMode() {
    if (!canvas || !ctx) {
        console.error('Canvas or context not initialized');
        return;
    }
    playerName = $('#playerName').val() || 'Player';
    localStorage.setItem('playerName', playerName);
    resetGame();
    level = 5;
    $('#startModal').removeClass('active');
    $('.game-canvas').addClass('active');
    resizeCanvas();
    spawnBoss();
    updateUI();
    gameState = 'playing';
    console.log('Boss mode started');
    requestAnimationFrame(gameLoop);
}

// Сброс игры
function resetGame() {
    score = 0;
    level = 1;
    gameTime = 0;
    specialBonuses = 0;
    enemiesKilled = 0;
    meteorsSpawned = 0;
    invincibilityBonusesSpawned = 0;
    lastScoreForInvincibility = 0; // Сброс для 🐢
    player.lives = 3;
    player.unlimitedShooting = false;
    player.bulletColor = '🔵';
    player.blinkTimer = 0;
    player.invincibility = false;
    player.invincibilityTimer = 0;
    enemies = [];
    bullets = [];
    bonuses = [];
    explosions = [];
    meteors = [];
    boss = null;
    formationDirection = 1;
    formationX = 0;
    diveCooldown = 0;
    bonusSpawnedThisLevel = false;
    pigBonusSpawned = false;
    secondBonusSpawned = false;
    currentBonusIndex = 0;
    levelCompleteTimer = 0;
    countdownTimer = 0;
    isPaused = false;
}

// Спавн врагов
function spawnEnemies() {
    enemies = [];
    const isMobile = canvas.width < 600;
    const cols = isMobile ? ENEMY_COLS_MOBILE : ENEMY_COLS_DESKTOP;
    const enemySize = isMobile ? 15 : 30;
    const spacingX = canvas.width / (cols + (isMobile ? 4 : 2));
    const spacingY = isMobile ? 25 : 40;
    const availableEmojis = level === 1 ? ['🪰', '🪲', '🪳', '🐞', '🐝', '🦜'] :
                           level < 5 ? ['🪰', '🪲', '🪳', '🐞', '🐝', '🦜', '🧚‍♀️', '🧚‍♂️', '🧚'] :
                           enemyEmojis;

    // 1-й ряд: 6 врагов
    for (let col = 0; col < 6; col++) {
        const emoji = level > 5 ? '🦋' : availableEmojis[Math.floor(Math.random() * availableEmojis.length)];
        enemies.push({ x: spacingX * (col + 2 + 1.5), y: spacingY, baseX: spacingX * (col + 2 + 1.5), baseY: spacingY,
                       width: enemySize, height: enemySize, emoji, dive: false, diveY: 0, lastShot: 0 });
    }

    // 2-й ряд: 8 врагов
    const fairyEmojis = ['🧚‍♀️', '🧚‍♂️', '🧚'];
    for (let col = 0; col < 8; col++) {
        const emoji = level >= 2 ? fairyEmojis[col % 3] : availableEmojis[Math.floor(Math.random() * availableEmojis.length)];
        enemies.push({ x: spacingX * (col + 2 + 0.5), y: spacingY * 2, baseX: spacingX * (col + 2 + 0.5), baseY: spacingY * 2,
                       width: enemySize, height: enemySize, emoji, dive: false, diveY: 0, lastShot: 0 });
    }

    // 3-9 ряды
    for (let row = 3; row <= 9; row++) {
        for (let col = 0; col < cols; col++) {
            const emoji = availableEmojis[Math.floor(Math.random() * availableEmojis.length)];
            enemies.push({ x: spacingX * (col + 2), y: spacingY * row, baseX: spacingX * (col + 2), baseY: spacingY * row,
                           width: enemySize, height: enemySize, emoji, dive: false, diveY: 0, lastShot: 0 });
        }
    }
}

// Спавн босса
function spawnBoss() {
    const isMobile = canvas.width < 600;
    const bossSize = isMobile ? 30 : 40;
    const bossIndex = (level / 5 - 1) % bossEmojis.length;
    boss = {
        x: canvas.width / 2, y: 50, width: bossSize, height: bossSize,
        emoji: bossEmojis[Math.floor(bossIndex)], lives: level === 5 ? 3 : 5,
        direction: 1, stopped: false, stopTimer: 0, blinkTimer: 0, lastAttack: 0, attackCount: 0
    };
}

// Спавн метеорита
function spawnMeteor() {
    const isMobile = canvas.width < 600;
    const meteorSize = isMobile ? 15 : 20;
    const angle = (Math.random() * 90 - 45) * Math.PI / 180;
    meteors.push({
        x: Math.random() * (canvas.width - meteorSize), y: 0,
        width: meteorSize, height: meteorSize, emoji: '☄️',
        vx: Math.sin(angle) * METEOR_SPEED, vy: Math.cos(angle) * METEOR_SPEED
    });
    meteorsSpawned++;
    console.log('Meteor spawned, total:', meteorsSpawned);
}

// Старт следующего уровня
function startNextLevel() {
    level++;
    bonusSpawnedThisLevel = false;
    pigBonusSpawned = level % 3 !== 0; // Сбрасываем для 🐽 и 🌪
    secondBonusSpawned = false;
    currentBonusIndex = level % bonusOrder.length;
    meteorsSpawned = 0;
    meteors = [];
    bullets = []; // Очистка пуль
    bonuses = []; // Очистка бонусов
    explosions = []; // Очистка взрывов
    formationX = 0;
    formationDirection = 1;
    diveCooldown = 0;
    if (level % 5 === 0) spawnBoss();
    else spawnEnemies();
    gameState = 'playing';
    updateUI();
    console.log('Next level started, level:', level, 'gameTime:', gameTime, 'score:', score, 'invincibilityBonusesSpawned:', invincibilityBonusesSpawned);
}

// Игровой цикл
function gameLoop(timestamp) {
    if (gameState !== 'playing' && gameState !== 'levelComplete' || isPaused) return;
    update(timestamp);
    render();
    requestAnimationFrame(gameLoop);
}

// Обновление
function update(timestamp) {
    if (gameState === 'levelComplete') {
        if (levelCompleteTimer > 0) levelCompleteTimer -= 16;
        else if (countdownTimer > 0) countdownTimer -= 16;
        else startNextLevel();
        return;
    }

    const isMobile = canvas.width < 600;
    const bulletSize = isMobile ? 5 : 10;
    const levelSpeedMultiplier = 1 + level * 0.05;
    let levelTime = gameTime - (level - 1) * (LEVEL_COMPLETE_DURATION + COUNTDOWN_DURATION) / 1000; // Время текущего уровня

    // Движение игрока
    if (player.movingLeft && player.x > 0) player.x -= PLAYER_SPEED;
    if (player.movingRight && player.x < canvas.width - player.width) player.x += PLAYER_SPEED;
    if (player.blinkTimer > 0) player.blinkTimer -= 16;
    if (player.invincibility) {
        player.invincibilityTimer -= 16;
        if (player.invincibilityTimer <= 0) {
            player.invincibility = false;
            console.log('Invincibility ended');
        }
    }

    // Движение формации
    if (enemies.length && !boss) {
        const nonDiving = enemies.filter(e => !e.dive);
        if (nonDiving.length) {
            const minX = Math.min(...nonDiving.map(e => e.baseX));
            const maxX = Math.max(...nonDiving.map(e => e.baseX + e.width));
            const formationWidth = maxX - minX;
            const maxOffset = (canvas.width - formationWidth - 10) / 2; // Отступ 5px с каждой стороны
            formationX += formationDirection * FORMATION_SPEED * levelSpeedMultiplier;
            if (formationX > maxOffset || formationX < -maxOffset) {
                formationDirection *= -1;
                formationX = Math.max(-maxOffset, Math.min(maxOffset, formationX));
            }
            console.log('Formation: minX=', minX, 'maxX=', maxX, 'formationWidth=', formationWidth, 'maxOffset=', maxOffset);
        }
    }

    // Обновление врагов
    enemies.forEach(enemy => {
        const diveSpeed = (enemy.emoji === '🦋' ? ENEMY_SPEED * 3 : ['🧚‍♀️', '🧚‍♂️', '🧚'].includes(enemy.emoji) ? ENEMY_SPEED * 2 : ENEMY_SPEED * (1 + Math.random())) * levelSpeedMultiplier;
        if (!enemy.dive) {
            enemy.x = enemy.baseX + formationX;
            enemy.y = enemy.baseY;
        } else {
            enemy.y += diveSpeed;
            const dx = player.x - enemy.x;
            const trackingSpeed = enemy.emoji === '🦋' ? 2 : ['🧚‍♀️', '🧚‍♂️', '🧚'].includes(enemy.emoji) ? 1.5 : 1;
            enemy.x += Math.min(Math.max(dx * 0.05, -trackingSpeed), trackingSpeed) + (Math.random() - 0.5) * (enemy.emoji === '🦋' ? 4 : 2);
            if (enemy.y > canvas.height) enemies.splice(enemies.indexOf(enemy), 1);
            // Стрельба при пикировании
            if (enemy.dive && (enemy.emoji === '🦋' || ['🧚‍♀️', '🧚‍♂️', '🧚'].includes(enemy.emoji)) && (!enemy.lastShot || timestamp - enemy.lastShot > (enemy.emoji === '🦋' ? 1000 : 1500))) {
                bullets.push({ x: enemy.x + enemy.width / 2 - bulletSize / 2, y: enemy.y + enemy.height,
                               width: bulletSize, height: bulletSize, emoji: '🟡', player: false });
                enemy.lastShot = timestamp;
                console.log(`${enemy.emoji} shot a bullet during dive`);
            }
        }
    });

    // Пикирование врагов
    diveCooldown = Math.max(0, diveCooldown - 16);
    let divingEnemies = enemies.filter(e => e.dive).length;
    if (diveCooldown <= 0 && divingEnemies < 3 && Math.random() < ENEMY_DIVE_PROB && !boss) {
        let diveCount = Math.min(Math.floor(Math.random() * 3) + 1, 3 - divingEnemies);
        let availableEnemies = enemies.filter(e => !e.dive);
        for (let i = 0; i < diveCount && availableEnemies.length; i++) {
            let enemy = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];
            enemy.dive = true;
            enemy.diveY = enemy.y;
            if (enemy.emoji === '🦋' && level > 5) {
                enemies.push({ x: enemy.x + 30, y: enemy.y, baseX: enemy.baseX, baseY: enemy.baseY,
                               width: enemy.width, height: enemy.height, emoji: '🦋', dive: true, diveY: enemy.y, lastShot: enemy.lastShot });
                enemies.push({ x: enemy.x - 30, y: enemy.y, baseX: enemy.baseX, baseY: enemy.baseY,
                               width: enemy.width, height: enemy.height, emoji: '🦋', dive: true, diveY: enemy.y, lastShot: enemy.lastShot });
                console.log('Butterfly split into three, offset ±30px');
            }
            availableEnemies = availableEnemies.filter(e => e !== enemy);
        }
        diveCooldown = 2000;
    }

    // Обновление босса
    if (boss) {
        if (boss.stopped) {
            boss.stopTimer -= 16;
            if (boss.stopTimer <= 0) {
                boss.stopped = false;
                boss.lastAttack = timestamp;
                boss.attackCount = 0;
            } else if (boss.attackCount < 3 && timestamp - boss.lastAttack >= BOSS_ATTACK_INTERVAL) {
                spawnBossEnemies();
                boss.lastAttack = timestamp;
                boss.attackCount++;
            }
        } else {
            boss.x += boss.direction * BOSS_SPEED * levelSpeedMultiplier;
            if (boss.x <= 0 || boss.x >= canvas.width - boss.width) boss.direction *= -1;
            if (timestamp - boss.lastAttack > BOSS_STOP_INTERVAL) {
                boss.stopped = true;
                boss.stopTimer = BOSS_STOP_DURATION;
                boss.lastAttack = timestamp;
                boss.attackCount = 0;
            }
        }
        if (boss.blinkTimer > 0) boss.blinkTimer -= 16;
    }

    // Обновление метеоритов
    meteors.forEach(meteor => {
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        if (meteor.y > canvas.height) meteors.splice(meteors.indexOf(meteor), 1);
    });

    // Спавн метеоритов
    if (level > 5 && levelTime >= METEOR_SPAWN_DELAY && meteors.length < MAX_METEORS && meteorsSpawned < TOTAL_METEORS_PER_LEVEL && Math.random() < METEOR_SPAWN_PROB) {
        spawnMeteor();
    }

    // Обновление пуль и бонусов
    bullets.forEach(bullet => {
        bullet.y += (bullet.player ? -BULLET_SPEED : BULLET_SPEED) * levelSpeedMultiplier;
        if (bullet.y < 0 || bullet.y > canvas.height) bullets.splice(bullets.indexOf(bullet), 1);
    });
    bonuses.forEach(bonus => {
        bonus.y += BONUS_SPEED;
        if (bonus.y > canvas.height) bonuses.splice(bonuses.indexOf(bonus), 1);
    });

    // Спавн бонусов
    const bonusSize = isMobile ? 15 : 20;
    if (enemiesKilled >= BONUS_THRESHOLD && !bonuses.some(b => b.emoji === '❤️')) {
        bonuses.push({ x: Math.random() * (canvas.width - bonusSize), y: 0, width: bonusSize, height: bonusSize, emoji: '❤️' });
        enemiesKilled -= BONUS_THRESHOLD;
        console.log('Heart bonus spawned, enemiesKilled:', enemiesKilled);
    }
    if (score >= 1500 * invincibilityBonusesSpawned && score > lastScoreForInvincibility && !bonuses.some(b => b.emoji === '🐢') && levelTime > 0) {
        bonuses.push({ x: Math.random() * (canvas.width - bonusSize), y: 0, width: bonusSize, height: bonusSize, emoji: '🐢' });
        invincibilityBonusesSpawned++;
        lastScoreForInvincibility = score;
        console.log('Invincibility bonus spawned at score:', score, 'invincibilityBonusesSpawned:', invincibilityBonusesSpawned, 'levelTime:', levelTime.toFixed(2));
    }
    if (levelTime >= BONUS_SPAWN_START && levelTime <= BONUS_SPAWN_END) {
        if (!bonusSpawnedThisLevel && Math.random() < BONUS_SPAWN_PROB && !bonuses.some(b => b.emoji === bonusOrder[currentBonusIndex])) {
            bonuses.push({ x: Math.random() * (canvas.width - bonusSize), y: 0, width: bonusSize, height: bonusSize, emoji: bonusOrder[currentBonusIndex] });
            bonusSpawnedThisLevel = true;
            console.log(`${bonusOrder[currentBonusIndex]} bonus spawned at levelTime: ${levelTime.toFixed(2)}s`);
        }
        if (levelTime > 180 && !secondBonusSpawned && Math.random() < BONUS_SPAWN_PROB && !bonuses.some(b => b.emoji === bonusOrder[(currentBonusIndex + 1) % bonusOrder.length])) {
            bonuses.push({ x: Math.random() * (canvas.width - bonusSize), y: 0, width: bonusSize, height: bonusSize, emoji: bonusOrder[(currentBonusIndex + 1) % bonusOrder.length] });
            secondBonusSpawned = true;
            console.log(`Second bonus ${bonusOrder[(currentBonusIndex + 1) % bonusOrder.length]} spawned at levelTime: ${levelTime.toFixed(2)}s`);
        }
    }

    // Обновление взрывов
    explosions.forEach(explosion => {
        explosion.timer -= 16;
        if (explosion.timer <= 0) explosions.splice(explosions.indexOf(explosion), 1);
    });

    checkCollisions();
    if (enemies.length === 0 && !boss && gameState === 'playing') {
        gameState = 'levelComplete';
        levelCompleteTimer = LEVEL_COMPLETE_DURATION;
        countdownTimer = COUNTDOWN_DURATION;
    }
}

// Спавн врагов от босса
function spawnBossEnemies() {
    const isMobile = canvas.width < 600;
    const enemySize = isMobile ? 15 : 30;
    [-60, 0, 60].forEach(offset => {
        enemies.push({
            x: boss.x + boss.width / 2 + offset, y: boss.y + boss.height,
            width: enemySize, height: enemySize,
            emoji: enemyEmojis[Math.floor(Math.random() * (enemyEmojis.length - 1)) + 1],
            dive: true, diveY: boss.y
        });
    });
}

// Проверка столкновений
function checkCollisions() {
    bullets.forEach(bullet => {
        if (bullet.player) {
            let enemiesToRemove = [];
            enemies.forEach(enemy => {
                if (collides(bullet, enemy)) {
                    explosions.push({ x: enemy.x, y: enemy.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    enemiesToRemove.push(enemy);
                    score += 50;
                    enemiesKilled++;
                    console.log('Enemy hit, score:', score, 'enemiesKilled:', enemiesKilled);
                }
            });
            enemiesToRemove.forEach(enemy => enemies.splice(enemies.indexOf(enemy), 1));

            bonuses.forEach(bonus => {
                if (collides(bullet, bonus)) {
                    explosions.push({ x: bonus.x, y: bonus.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    bonuses.splice(bonuses.indexOf(bonus), 1);
                    console.log(`Bonus ${bonus.emoji} hit by bullet and destroyed`);
                }
            });
            meteors.forEach(meteor => {
                if (collides(bullet, meteor)) {
                    explosions.push({ x: meteor.x, y: meteor.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    meteors.splice(meteors.indexOf(meteor), 1);
                    console.log('Meteor hit and destroyed');
                }
            });
            if (enemiesToRemove.length || bonuses.some(b => collides(bullet, b)) || meteors.some(m => collides(bullet, m))) {
                bullets.splice(bullets.indexOf(bullet), 1);
            }
            if (boss && collides(bullet, boss)) {
                boss.lives--;
                boss.blinkTimer = BOSS_BLINK_DURATION;
                bullets.splice(bullets.indexOf(bullet), 1);
                console.log('Boss hit, lives remaining:', boss.lives);
                if (boss.lives <= 0) {
                    explosions.push({ x: boss.x, y: boss.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    boss = null;
                    gameState = 'levelComplete';
                    levelCompleteTimer = LEVEL_COMPLETE_DURATION;
                    countdownTimer = COUNTDOWN_DURATION;
                    console.log('Boss defeated');
                }
            }
        } else if (!player.invincibility && collides(bullet, player)) {
            player.lives--;
            player.unlimitedShooting = false; // Отключение бесконечной стрельбы
            player.bulletColor = '🔵';
            player.blinkTimer = PLAYER_BLINK_DURATION;
            bullets.splice(bullets.indexOf(bullet), 1);
            explosions.push({ x: player.x, y: player.y, timer: EXPLOSION_DURATION, opacity: 1 });
            console.log('Player hit by enemy bullet, lives:', player.lives);
            if (player.lives <= 0) gameOver();
        }
    });

    if (!player.invincibility) {
        enemies.forEach(enemy => {
            if (collides(enemy, player)) {
                player.lives--;
                player.unlimitedShooting = false; // Отключение бесконечной стрельбы
                player.bulletColor = '🔵';
                enemies.splice(enemies.indexOf(enemy), 1);
                explosions.push({ x: player.x, y: player.y, timer: EXPLOSION_DURATION, opacity: 1 });
                console.log('Player hit by enemy, lives:', player.lives);
                if (player.lives <= 0) gameOver();
            }
        });

        meteors.forEach(meteor => {
            if (collides(meteor, player)) {
                player.lives--;
                player.unlimitedShooting = false; // Отключение бесконечной стрельбы
                player.bulletColor = '🔵';
                player.blinkTimer = PLAYER_BLINK_DURATION;
                meteors.splice(meteors.indexOf(meteor), 1);
                explosions.push({ x: player.x, y: player.y, timer: EXPLOSION_DURATION, opacity: 1 });
                console.log('Player hit by meteor, lives:', player.lives);
                if (player.lives <= 0) gameOver();
            }
        });
    }

    bonuses.forEach(bonus => {
        if (collides(bonus, player)) {
            if (bonus.emoji === '❤️') {
                if (player.lives < 5) player.lives++;
                score += 270;
                specialBonuses++;
                console.log('Heart bonus collected, lives:', player.lives, 'score:', score);
            } else if (bonus.emoji === '✨') {
                player.unlimitedShooting = true;
                player.bulletColor = '🔴';
                console.log('Unlimited shooting activated, bullet color changed to 🔴');
            } else if (bonus.emoji === '🐽') {
                const enemiesToRemove = [];
                const enemyCount = enemies.length;
                const toDestroy = Math.floor(enemyCount * 0.25);
                for (let i = 0; i < toDestroy && enemies.length > 0; i++) {
                    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
                    enemiesToRemove.push(enemy);
                    explosions.push({ x: enemy.x, y: enemy.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    score += 50;
                    enemiesKilled++;
                }
                enemiesToRemove.forEach(enemy => enemies.splice(enemies.indexOf(enemy), 1));
                console.log(`Pig bonus collected, destroyed ${toDestroy} enemies (25%), enemiesKilled: ${enemiesKilled}`);
            } else if (bonus.emoji === '🐢') {
                player.invincibility = true;
                player.invincibilityTimer = INVINCIBILITY_DURATION;
                console.log('Invincibility bonus collected, duration: 45s');
            } else if (bonus.emoji === '🌪') {
                const enemiesToRemove = [];
                const enemyCount = enemies.length;
                const toDestroy = Math.floor(enemyCount * 0.1);
                for (let i = 0; i < toDestroy && enemies.length > 0; i++) {
                    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
                    enemiesToRemove.push(enemy);
                    explosions.push({ x: enemy.x, y: enemy.y, timer: EXPLOSION_DURATION, opacity: 1 });
                    score += 50;
                    enemiesKilled++;
                }
                enemiesToRemove.forEach(enemy => enemies.splice(enemies.indexOf(enemy), 1));
                console.log(`Tornado bonus collected, destroyed ${toDestroy} enemies (10%), enemiesKilled: ${enemiesKilled}`);
            }
            bonuses.splice(bonuses.indexOf(bonus), 1);
        }
    });

    updateUI();
}

// Проверка столкновений
function collides(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Рендеринг
function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isMobile = canvas.width < 600;
    const explosionSize = isMobile ? 15 : 20;

    if (gameState === 'playing') {
        // Рендеринг игрока и окружности неуязвимости
        ctx.font = `${player.height}px Arial`;
        ctx.save();
        if (player.invincibility) {
            ctx.beginPath();
            const radius = 15 + Math.sin(Date.now() / 200) * 5;
            ctx.arc(player.x + player.width / 2, player.y + player.height / 2, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#008000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.globalAlpha = player.blinkTimer > 0 ? 0.5 + Math.sin(Date.now() / 50) * 0.5 : 1;
        if (player.direction === 'left') {
            ctx.scale(-1, 1);
            ctx.fillText(player.emoji, -player.x - player.width, player.y + player.height);
        } else {
            ctx.fillText(player.emoji, player.x, player.y + player.height);
        }
        ctx.restore();

        // Рендеринг врагов
        enemies.forEach(enemy => {
            ctx.font = `${enemy.height}px Arial`;
            ctx.fillText(enemy.emoji, enemy.x, enemy.y + enemy.height);
        });

        // Рендеринг босса
        if (boss) {
            ctx.globalAlpha = boss.blinkTimer > 0 ? 0.5 + Math.sin(Date.now() / 50) * 0.5 : 1;
            ctx.font = `${boss.height}px Arial`;
            ctx.fillText(boss.emoji, boss.x, boss.y + boss.height);
            ctx.globalAlpha = 1;
        }

        // Рендеринг пуль
        bullets.forEach(bullet => {
            ctx.font = `${bullet.height}px Arial`;
            ctx.fillText(bullet.emoji, bullet.x, bullet.y + bullet.height);
        });

        // Рендеринг бонусов с пульсирующей окружностью
        bonuses.forEach(bonus => {
            ctx.save();
            ctx.beginPath();
            const radius = 10 + Math.sin(Date.now() / 200) * 5;
            ctx.arc(bonus.x + bonus.width / 2, bonus.y + bonus.height / 2, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = bonusColors[bonus.emoji] || '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.font = `${bonus.height}px Arial`;
            ctx.fillText(bonus.emoji, bonus.x, bonus.y + bonus.height);
            ctx.restore();
        });

        // Рендеринг метеоритов
        meteors.forEach(meteor => {
            ctx.font = `${meteor.height}px Arial`;
            ctx.save();
            ctx.translate(meteor.x + meteor.width / 2, meteor.y + meteor.height / 2);
            ctx.rotate(Math.atan2(meteor.vy, metro.vx) + Math.PI);
            ctx.fillText(meteor.emoji, -meteor.width / 2, -meteor.height / 2);
            ctx.restore();
        });

        // Рендеринг взрывов
        explosions.forEach(explosion => {
            ctx.globalAlpha = explosion.timer / EXPLOSION_DURATION;
            ctx.font = `${explosionSize}px Arial`;
            ctx.fillText('💥', explosion.x, explosion.y + explosionSize);
            ctx.globalAlpha = 1;
        });
    } else if (gameState === 'levelComplete') {
        const fontSize = isMobile ? 40 : 60;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const centerX = canvas.width / 2, centerY = canvas.height / 2;
        if (levelCompleteTimer > 0) {
            ctx.fillText('Level complete!', centerX, centerY);
        } else if (countdownTimer > 0) {
            const countdown = Math.ceil(countdownTimer / 1000);
            const progress = (countdownTimer % 1000) / 1000;
            const scale = 1 + Math.sin(progress * Math.PI) * 0.2;
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.scale(scale, scale);
            ctx.fillText(countdown.toString(), 0, 0);
            ctx.restore();
        }
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
}

// Обновление UI
function updateUI() {
    const $ui = {
        score: $('#score'),
        lives: $('#lives'),
        level: $('#level'),
        bossLives: $('#bossLives'),
        time: $('#time')
    };
    $ui.score.text(score);
    $ui.lives.html('<i class="icofont-heart-alt player"></i>'.repeat(player.lives));
    $ui.level.text(level);
    $ui.bossLives.html(boss ? '<i class="icofont-heart-alt boss"></i>'.repeat(boss.lives) : '');
}

// Обновление времени
function updateGameTime() {
    if (gameState !== 'playing' || isPaused) return setTimeout(updateGameTime, 1000);
    gameTime++;
    const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
    const seconds = (gameTime % 60).toString().padStart(2, '0');
    $('#time').text(`${minutes}:${seconds}`);
    setTimeout(updateGameTime, 1000);
}

// Конец игры
function gameOver() {
    gameState = 'gameover';
    const $ui = {
        resultName: $('#resultName'),
        resultTime: $('#resultTime'),
        resultBonus: $('#resultBonus'),
        resultSpecial: $('#resultSpecial'),
        resultLevels: $('#resultLevels'),
        gameCanvas: $('.game-canvas')
    };
    $ui.resultName.text(playerName);
    $ui.resultTime.text($('#time').text());
    $ui.resultBonus.text(score);
    $ui.resultSpecial.text(specialBonuses);
    $ui.resultLevels.text(level - 1);
    $ui.gameCanvas.removeClass('active');
    showModal('results');
}

// Показ модального окна
function showModal(modalId) {
    $('.modal-content-custom').removeClass('active');
    $(`#${modalId}Modal`).addClass('active');
    if (modalId === 'pause') {
        isPaused = true;
        $('.game-canvas').removeClass('active');
    } else if (modalId === 'start' || modalId === 'results') {
        $('.game-canvas').removeClass('active');
    }
}

// Возобновление игры
function resumeGame() {
    isPaused = false;
    $('#pauseModal').removeClass('active');
    $('.game-canvas').addClass('active');
    resizeCanvas();
    requestAnimationFrame(gameLoop);
}

// Переключение темы
function toggleTheme() {
    $('body').toggleClass('dark');
    $('.neomorph').toggleClass('neomorph-dark');
    $('.neomorph-button').toggleClass('neomorph-button-dark');
    $('.modal-content-custom').toggleClass('dark');
    $('.slider').toggleClass('dark');
}

// Выбор персонажа
$('.character-select button').on('click', function() {
    $('.character-select button').removeClass('selected');
    $(this).addClass('selected');
    player.emoji = $(this).text();
    localStorage.setItem('playerEmoji', player.emoji);
});

// Инициализация
$(document).ready(() => {
    playerName = localStorage.getItem('playerName') || 'Player';
    $('#playerName').val(playerName);
    init();
});