
/* ============================================================
   THREE.JS — 3D PARTICLE HOLDER COUNT
   Particles form the number shape, explode & reform on change
   ============================================================ */
var scene, camera, renderer;
var particleSystem, particleGeometry, particleMaterial;
var dustSystem, dustGeometry;
var ringMesh;
var PARTICLE_COUNT = 5120;
var positions, targets, velocities, colors, sizes;
var threeReady = false;
var time = 0;
var shakeIntensity = 0;
var baseCamX = 0, baseCamY = 0, baseCamZ = 38;
var shockwaves = [];
var burstSystems = [];

/* === PER-DIGIT PARTICLE STATE (Issues 2 & 3) === */
var MAX_DIGITS = 16;
var DIGIT_CAPACITY = 320;
var DIGIT_SPACING = 9.0;
var MORPH_DUR = 0.8;
var activeDigitCount = 0;
var slotX = new Array(MAX_DIGITS).fill(0);
var charHalfW = 3, charHalfH = 5;
var digitChar = new Array(MAX_DIGITS).fill(' ');
var digitSource = [], digitScatter = [], digitDest = [], digitNextDest = [];
var digitMorphing = new Array(MAX_DIGITS).fill(false);
var digitMorphStart = new Array(MAX_DIGITS).fill(0);
for (var di = 0; di < MAX_DIGITS; di++) {
    digitSource[di] = new Float32Array(DIGIT_CAPACITY * 3);
    digitScatter[di] = new Float32Array(DIGIT_CAPACITY * 3);
    digitDest[di] = new Float32Array(DIGIT_CAPACITY * 3);
    digitNextDest[di] = new Float32Array(DIGIT_CAPACITY * 3);
}
var anyMorphing = false;

function initThree() {
    var canvas = document.getElementById('three-canvas');
    scene = new THREE.Scene();
    var container = canvas.parentElement || canvas;
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(baseCamX, baseCamY, baseCamZ);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x050505, 0);

    // === MAIN PARTICLE SYSTEM ===
    positions = new Float32Array(PARTICLE_COUNT * 3);
    targets = new Float32Array(PARTICLE_COUNT * 3);
    velocities = new Float32Array(PARTICLE_COUNT * 3);
    colors = new Float32Array(PARTICLE_COUNT * 3);
    sizes = new Float32Array(PARTICLE_COUNT);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
        var angle = Math.random() * Math.PI * 2;
        var r = 30 + Math.random() * 40;
        positions[i*3]     = Math.cos(angle) * r;
        positions[i*3 + 1] = Math.sin(angle) * r * 0.6;
        positions[i*3 + 2] = (Math.random() - 0.5) * 30;

        targets[i*3]     = positions[i*3];
        targets[i*3 + 1] = positions[i*3 + 1];
        targets[i*3 + 2] = positions[i*3 + 2];

        velocities[i*3] = 0;
        velocities[i*3 + 1] = 0;
        velocities[i*3 + 2] = 0;

        var b = 0.65 + Math.random() * 0.35;
        colors[i*3]     = 1.0 * b;
        colors[i*3 + 1] = 0.72 * b;
        colors[i*3 + 2] = 0.0;

        sizes[i] = 0.18 + Math.random() * 0.22;
    }

    particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPixelRatio: { value: renderer.getPixelRatio() },
            uGlow: { value: 0 }
        },
        vertexShader: [
            'attribute float aSize;',
            'attribute vec3 aColor;',
            'varying vec3 vColor;',
            'varying float vDist;',
            'uniform float uTime;',
            'uniform float uPixelRatio;',
            'uniform float uGlow;',
            'void main() {',
            '    vColor = aColor * (1.0 + uGlow * 0.5);',
            '    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
            '    vDist = -mvPosition.z;',
            '    float pulse = 1.0 + uGlow * 0.3;',
            '    gl_PointSize = aSize * pulse * (350.0 / -mvPosition.z) * uPixelRatio;',
            '    gl_Position = projectionMatrix * mvPosition;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'varying vec3 vColor;',
            'varying float vDist;',
            'void main() {',
            '    float d = length(gl_PointCoord - vec2(0.5));',
            '    if (d > 0.5) discard;',
            '    float core = 1.0 - smoothstep(0.0, 0.15, d);',
            '    float halo = 1.0 - smoothstep(0.15, 0.5, d);',
            '    float alpha = core + halo * 0.4;',
            '    vec3 col = vColor + core * 0.3;',
            '    gl_FragColor = vec4(col, alpha);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // === BACKGROUND DUST ===
    var DUST_COUNT = 500;
    var dustPos = new Float32Array(DUST_COUNT * 3);
    var dustCol = new Float32Array(DUST_COUNT * 3);
    var dustSiz = new Float32Array(DUST_COUNT);

    for (var i = 0; i < DUST_COUNT; i++) {
        dustPos[i*3]     = (Math.random() - 0.5) * 150;
        dustPos[i*3 + 1] = (Math.random() - 0.5) * 100;
        dustPos[i*3 + 2] = (Math.random() - 0.5) * 80 - 30;

        var db = 0.3 + Math.random() * 0.3;
        dustCol[i*3]     = 1.0 * db;
        dustCol[i*3 + 1] = 0.72 * db;
        dustCol[i*3 + 2] = 0.0;

        dustSiz[i] = 0.04 + Math.random() * 0.1;
    }

    dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    dustGeometry.setAttribute('aColor', new THREE.BufferAttribute(dustCol, 3));
    dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSiz, 1));

    var dustMat = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 } },
        vertexShader: [
            'attribute float aSize;',
            'attribute vec3 aColor;',
            'varying vec3 vColor;',
            'uniform float uPixelRatio;',
            'uniform float uTime;',
            'void main() {',
            '    vColor = aColor;',
            '    vec3 pos = position;',
            '    pos.y += sin(uTime * 0.3 + position.x * 0.1) * 0.5;',
            '    pos.x += cos(uTime * 0.2 + position.y * 0.1) * 0.3;',
            '    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);',
            '    gl_PointSize = aSize * (350.0 / -mvPosition.z) * uPixelRatio;',
            '    gl_Position = projectionMatrix * mvPosition;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'varying vec3 vColor;',
            'void main() {',
            '    float d = length(gl_PointCoord - vec2(0.5));',
            '    if (d > 0.5) discard;',
            '    float a = 1.0 - smoothstep(0.2, 0.5, d);',
            '    gl_FragColor = vec4(vColor, a * 0.4);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    dustSystem = new THREE.Points(dustGeometry, dustMat);
    scene.add(dustSystem);

    // === ROTATING RING (subtle depth element) ===
    var ringGeo = new THREE.TorusGeometry(18, 0.08, 8, 100);
    var ringMat = new THREE.MeshBasicMaterial({
        color: 0xFFB800,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending
    });
    ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.z = -8;
    scene.add(ringMesh);

    var ring2Geo = new THREE.TorusGeometry(14, 0.05, 8, 80);
    var ring2Mat = new THREE.MeshBasicMaterial({
        color: 0xCC0000,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending
    });
    var ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.z = -6;
    ring2.rotation.x = Math.PI / 3;
    scene.add(ring2);

    animate();
    threeReady = true;
    if (holderCount !== null) setNumberTargets(holderCount); // paint immediately if data already arrived
}

/* === TEXT TO PARTICLE TARGETS === */
function sampleTextToPoints(text) {
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    var fontSize = 200;
    c.width = Math.max(text.length * 130, 400);
    c.height = 300;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = 'bold ' + fontSize + 'px "Space Mono", monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2);

    var imgData = ctx.getImageData(0, 0, c.width, c.height);
    var pts = [];
    var step = 3;
    for (var y = 0; y < c.height; y += step) {
        for (var x = 0; x < c.width; x += step) {
            var idx = (y * c.width + x) * 4;
            if (imgData.data[idx] > 128) {
                pts.push({
                    x: (x - c.width / 2) * 0.035,
                    y: (c.height / 2 - y) * 0.035,
                    z: (Math.random() - 0.5) * 1.2
                });
            }
        }
    }
    return pts;
}

function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* === PER-DIGIT PARTICLE TARGETS (Issues 2 & 3) === */
function canvasWidth() { return (renderer && renderer.domElement) ? renderer.domElement.clientWidth || window.innerWidth : window.innerWidth; }
function canvasHeight() { return (renderer && renderer.domElement) ? renderer.domElement.clientHeight || window.innerHeight : window.innerHeight; }

function getCharPoints(ch) {
    var pts = sampleTextToPoints(ch);
    if (pts.length === 0) pts = [{ x: 0, y: 0, z: 0 }];
    return pts;
}

/* Fit-to-viewport sizing: guarantees the full number is visible with margin
   on all 4 sides at the current camera distance (Issue 2). Sizes to the ACTUAL
   digit count so real 5-6 digit numbers render large & readable, not tiny. */
function computeCharScales() {
    var cw = canvasWidth(), chh = canvasHeight();
    var halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * baseCamZ;
    var halfW = halfH * (cw / chh);
    var M = 0.82; // safety margin so nothing clips
    var availH = halfH * M;
    var availW = halfW * M;
    var n = Math.max(activeDigitCount, 1);
    var spacing = Math.min(availW / (n * 0.62), 9.0);
    var scale = Math.min((availH * 0.92) / (charHalfH * 2), (spacing * 0.92) / (charHalfW * 2));
    return { spacing: spacing, scale: scale };
}

function setNumberTargets(number) {
    if (!threeReady) return; // wait until Three.js is initialized (Issue 1: fetch can arrive earlier)
    var text = formatNumber(number);
    activeDigitCount = Math.min(text.length, MAX_DIGITS);
    if (activeDigitCount === 0) return;
    recalcDigitLayout();
    for (var s = 0; s < activeDigitCount; s++) {
        var ch = text[s];
        digitChar[s] = ch;
        var pts = getCharPoints(ch);
        var dest = digitDest[s];
        for (var i = 0; i < DIGIT_CAPACITY; i++) {
            var p = pts[i % pts.length];
            dest[i*3]     = p.x * charScale + (Math.random() - 0.5) * 0.08;
            dest[i*3 + 1] = p.y * charScale + (Math.random() - 0.5) * 0.08;
            dest[i*3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
        }
        digitNextDest[s].set(dest); // keep staged target in sync
        // Initialize source = dest for first paint
        digitSource[s].set(dest);
    }
}

function recalcDigitLayout() {
    var sc = computeCharScales();
    charScale = sc.scale;
    var spacing = sc.spacing;
    var totalW = (activeDigitCount - 1) * spacing;
    var startX = -totalW / 2;
    for (var s = 0; s < activeDigitCount; s++) {
        slotX[s] = startX + s * spacing;
    }
}

/* Issue 3: per-digit odometer-style morph with left-to-right stagger.
   Only digits whose character changed are re-scattered & re-converged.
   The new destination is staged in digitNextDest; it's only copied into
   digitDest (the live target the morph loop reads) when that digit's s*80ms
   timer fires, so the cascade is real and there's no pop. */
function triggerDigitMorphs(newNumber, isUp) {
    var text = formatNumber(newNumber);
    var newCount = Math.min(text.length, MAX_DIGITS);
    var changed = false;
    var maxLen = Math.max(activeDigitCount, newCount);

    // Stage all new destinations first (so layout/spacing is consistent),
    // but keep morphing=false until each digit's staggered timer fires.
    var stages = [];
    for (var s = 0; s < maxLen; s++) {
        var oldC = s < activeDigitCount ? digitChar[s] : null;
        var newC = s < newCount ? text[s] : null;
        if (oldC !== newC) {
            changed = true;
            if (newC === null) continue; // a digit disappeared (number shrank) — leave as-is visually
            digitChar[s] = newC;
            if (s >= activeDigitCount) activeDigitCount = s + 1;
            var pts = getCharPoints(newC);
            var next = digitNextDest[s];
            for (var i = 0; i < DIGIT_CAPACITY; i++) {
                var p = pts[i % pts.length];
                next[i*3]     = p.x * charScale + (Math.random() - 0.5) * 0.08;
                next[i*3 + 1] = p.y * charScale + (Math.random() - 0.5) * 0.08;
                next[i*3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
            }
            stages.push(s);
        }
    }
    recalcDigitLayout(); // recompute spacing/scale for the new digit count

    // Fire each changed digit's morph with a left-to-right stagger (s * 80ms)
    for (var k = 0; k < stages.length; k++) {
        (function(slot) {
            setTimeout(function() {
                if (!threeReady) return;
                // Promote staged target to the live destination
                digitDest[slot].set(digitNextDest[slot]);
                var pos = particleGeometry.attributes.position.array;
                var base = slot * DIGIT_CAPACITY * 3;
                for (var i = 0; i < DIGIT_CAPACITY * 3; i++) {
                    digitScatter[slot][i] = pos[base + i];
                }
                digitMorphing[slot] = true;
                digitMorphStart[slot] = time;
            }, slot * 80);
        })(stages[k]);
    }

    if (changed) {
        edgeFlash(isUp);
        shakeIntensity = 0.5;
        gsap.to(particleMaterial.uniforms.uGlow, { value: 1.0, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' });
        spawnShockwave(0xFFB800, 0);
        spawnShockwave(isUp ? 0x00CC44 : 0xCC0000, 160);
        spawnBurst(0xFFB800, 120);
    }
}
var charScale = 1;

/* === SHOCKWAVE RINGS === */
function spawnShockwave(color, delay) {
    setTimeout(function() {
        var geo = new THREE.RingGeometry(0.5, 0.7, 64);
        var mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        var ring = new THREE.Mesh(geo, mat);
        ring.position.z = -2;
        scene.add(ring);
        shockwaves.push({ mesh: ring, life: 0, mat: mat, geo: geo });
    }, delay || 0);
}

function updateShockwaves() {
    for (var i = shockwaves.length - 1; i >= 0; i--) {
        var sw = shockwaves[i];
        sw.life += 0.018;
        var s = 1 + sw.life * 40;
        sw.mesh.scale.set(s, s, 1);
        sw.mat.opacity = Math.max(0, 0.9 - sw.life * 0.9);
        sw.mesh.rotation.z += 0.02;
        if (sw.life > 1.2) {
            scene.remove(sw.mesh);
            sw.geo.dispose();
            sw.mat.dispose();
            shockwaves.splice(i, 1);
        }
    }
}

/* === BURST PARTICLES === */
function spawnBurst(color, count) {
    count = count || 250;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var vel = new Float32Array(count * 3);
    var life = new Float32Array(count);
    var col = new Float32Array(count * 3);

    var r = ((color >> 16) & 0xff) / 255;
    var g = ((color >> 8) & 0xff) / 255;
    var b = (color & 0xff) / 255;

    for (var i = 0; i < count; i++) {
        pos[i*3] = 0;
        pos[i*3+1] = 0;
        pos[i*3+2] = 0;

        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var speed = 1.5 + Math.random() * 4;
        vel[i*3]   = Math.cos(theta) * Math.sin(phi) * speed;
        vel[i*3+1] = Math.sin(theta) * Math.sin(phi) * speed;
        vel[i*3+2] = Math.cos(phi) * speed;

        life[i] = 1.0;
        var br = 0.7 + Math.random() * 0.3;
        col[i*3] = r * br;
        col[i*3+1] = g * br;
        col[i*3+2] = b * br;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

    var mat = new THREE.ShaderMaterial({
        uniforms: { uPixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: [
            'attribute vec3 aColor;',
            'varying vec3 vColor;',
            'uniform float uPixelRatio;',
            'void main() {',
            '    vColor = aColor;',
            '    vec4 mv = modelViewMatrix * vec4(position, 1.0);',
            '    gl_PointSize = 8.0 * (300.0 / -mv.z) * uPixelRatio;',
            '    gl_Position = projectionMatrix * mv;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'varying vec3 vColor;',
            'void main() {',
            '    float d = length(gl_PointCoord - vec2(0.5));',
            '    if (d > 0.5) discard;',
            '    float a = 1.0 - smoothstep(0.0, 0.5, d);',
            '    gl_FragColor = vec4(vColor, a);',
            '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    var burst = new THREE.Points(geo, mat);
    burst.userData = { vel: vel, life: life, mat: mat, geo: geo };
    scene.add(burst);
    burstSystems.push(burst);
}

function updateBursts() {
    for (var b = burstSystems.length - 1; b >= 0; b--) {
        var burst = burstSystems[b];
        var pos = burst.geometry.attributes.position.array;
        var vel = burst.userData.vel;
        var life = burst.userData.life;
        var alive = false;

        for (var i = 0; i < pos.length / 3; i++) {
            if (life[i] > 0) {
                pos[i*3]   += vel[i*3];
                pos[i*3+1] += vel[i*3+1];
                pos[i*3+2] += vel[i*3+2];
                vel[i*3]   *= 0.94;
                vel[i*3+1] *= 0.94;
                vel[i*3+2] *= 0.94;
                life[i] -= 0.018;
                alive = true;
            }
        }

        burst.geometry.attributes.position.needsUpdate = true;
        var avgLife = 0;
        for (var i = 0; i < life.length; i++) avgLife += life[i];
        burst.userData.mat.uniforms = burst.userData.mat.uniforms || {};

        if (!alive) {
            scene.remove(burst);
            burst.userData.geo.dispose();
            burst.userData.mat.dispose();
            burstSystems.splice(b, 1);
        }
    }
}

/* === EDGE FLASH === */
function edgeFlash(isUp) {
    var el = document.getElementById('edge-flash');
    el.classList.remove('red');
    if (!isUp) el.classList.add('red');
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 1000);
}

/* === THE BIG NUMBER CHANGE SEQUENCE (now per-digit, Issue 3) === */
function changeNumber(newNumber, isUp) {
    console.log('[Morph] Per-digit change to', newNumber, isUp ? 'UP' : 'DOWN');
    if (!threeReady) return;
    triggerDigitMorphs(newNumber, isUp);
}

/* === RENDER LOOP === */
function animate() {
    requestAnimationFrame(animate);
    time += 0.016;

    var posArr = particleGeometry.attributes.position.array;

    // Determine overall morph activity
    anyMorphing = false;
    for (var s = 0; s < activeDigitCount; s++) {
        if (digitMorphing[s]) { anyMorphing = true; break; }
    }

    for (var s = 0; s < activeDigitCount; s++) {
        var src = digitSource[s];
        var dst = digitDest[s];
        var scat = digitScatter[s];
        var sx = slotX[s];
        var base = s * DIGIT_CAPACITY * 3;

        if (digitMorphing[s]) {
            var t = (time - digitMorphStart[s]) / MORPH_DUR;
            if (t >= 1) { t = 1; digitMorphing[s] = false; }
            // eased scatter-then-converge: 0->0.35 scatter out, 0.35->1 converge in
            var ps, pc;
            if (t < 0.35) { ps = t / 0.35; pc = 0; }
            else { ps = 1; pc = (t - 0.35) / 0.65; }
            var ease = pc * pc * (3 - 2 * pc); // smoothstep
            for (var i = 0; i < DIGIT_CAPACITY; i++) {
                var ix = base + i*3;
                var ix3 = i*3;
                // scatter target (explode outward from slot center)
                var ox = scat[ix3]     - sx;
                var oy = scat[ix3 + 1];
                var oz = scat[ix3 + 2];
                var r = 6 + (i % 7);
                var ang = (i * 2.39996) + time * 0.0;
                var sxOut = ox * (1 - ps) + Math.cos(ang) * r * ps;
                var syOut = oy * (1 - ps) + (Math.sin(ang) * r + (i%5-2)*1.5) * ps;
                var szOut = oz * (1 - ps) + (i % 9) * ps;
                // converge from scatter point to final destination
                var fx = dst[ix3]     + sx;
                var fy = dst[ix3 + 1];
                var fz = dst[ix3 + 2];
                posArr[ix]     = sxOut * (1 - ease) + fx * ease;
                posArr[ix + 1] = syOut * (1 - ease) + fy * ease;
                posArr[ix + 2] = szOut * (1 - ease) + fz * ease;
            }
            // keep source synced to current pos so a new morph starts smoothly
            for (var i = 0; i < DIGIT_CAPACITY * 3; i++) src[i] = posArr[base + i];
        } else {
            // idle breathing around the destination shape
            for (var i = 0; i < DIGIT_CAPACITY; i++) {
                var ix = base + i*3;
                var ix3 = i*3;
                var fx = dst[ix3]     + sx;
                var fy = dst[ix3 + 1];
                var fz = dst[ix3 + 2];
                posArr[ix]     = fx + Math.sin(time * 1.5 + i * 0.1) * 0.05;
                posArr[ix + 1] = fy + Math.cos(time * 1.3 + i * 0.08) * 0.05;
                posArr[ix + 2] = fz + Math.sin(time * 0.9 + i * 0.05) * 0.1;
                src[ix3] = fx; src[ix3+1] = fy; src[ix3+2] = fz;
            }
        }
    }
    particleGeometry.attributes.position.needsUpdate = true;

    // Dust motion
    if (dustGeometry) {
        dustSystem.material.uniforms.uTime.value = time;
    }

    // Rings
    if (ringMesh) {
        ringMesh.rotation.z += 0.003;
        ringMesh.rotation.x = Math.sin(time * 0.3) * 0.15;
    }

    // Shockwaves
    updateShockwaves();

    // Bursts
    updateBursts();

    // Camera shake
    if (shakeIntensity > 0.01) {
        camera.position.x = baseCamX + (Math.random() - 0.5) * shakeIntensity;
        camera.position.y = baseCamY + (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity *= 0.87;
    } else {
        // Subtle breathing
        camera.position.x = baseCamX + Math.sin(time * 0.3) * 0.3;
        camera.position.y = baseCamY + Math.cos(time * 0.25) * 0.2;
    }
    camera.position.z = baseCamZ + Math.sin(time * 0.4) * 1.0;

    particleMaterial.uniforms.uTime.value = time;

    renderer.render(scene, camera);
}

// Resize
window.addEventListener('resize', function() {
    var canvas = renderer.domElement;
    var container = canvas.parentElement || canvas;
    var w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    recalcDigitLayout();
    for (var s = 0; s < activeDigitCount; s++) {
        // refresh destination points at new scale (keep staged target in sync too)
        var pts = getCharPoints(digitChar[s]);
        var dest = digitDest[s];
        var next = digitNextDest[s];
        for (var i = 0; i < DIGIT_CAPACITY; i++) {
            var p = pts[i % pts.length];
            var dx = p.x * charScale + (Math.random() - 0.5) * 0.08;
            var dy = p.y * charScale + (Math.random() - 0.5) * 0.08;
            var dz = p.z + (Math.random() - 0.5) * 0.3;
            dest[i*3] = dx; dest[i*3 + 1] = dy; dest[i*3 + 2] = dz;
            next[i*3] = dx; next[i*3 + 1] = dy; next[i*3 + 2] = dz;
        }
    }
});

/* ============================================================
   HOLDER COUNTER — INSTANT via DexScreener /tokens/v1/solana API
   (Issue 1: no slow RPC scans — holders returned in <1s, no key)
   ============================================================ */
var TOKEN_ADDR = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
var DEX_HOLDERS_URL = 'https://api.dexscreener.com/tokens/v1/solana/' + TOKEN_ADDR;
var HOLDER_POLL_MS = 15000;   // Issue 1 spec: poll every 15s
var HOLDER_RETRY_CAP = 3;

var holderCount = null;
var initialHolderCount = null;
var holderHistory = [];
var sparklineChart = null;
var holderRetries = 0;
var isFetchingHolders = false;
var holderSource = 'unknown';
var holderPollInterval = null;

var deltaText = document.getElementById('delta-text');
var loadingDisplay = document.getElementById('loading-display');
var sparklineContainer = document.getElementById('sparkline-container');

function setScanningText(t) {
    var el = loadingDisplay.querySelector('.scanning-text');
    if (el) el.textContent = t;
}

function showHolderFailedUI() {
    loadingDisplay.classList.add('hidden');
    if (holderCount === null) {
        try { setNumberTargets(0); } catch (e) {}
    }
    deltaText.textContent = 'holder data unavailable \u2014 tap to retry';
    deltaText.className = 'delta-display delta-negative';
    deltaText.style.opacity = '1';
    deltaText.style.cursor = 'pointer';
    deltaText.onclick = function() {
        holderRetries = 0;
        loadingDisplay.classList.remove('hidden');
        setScanningText('SCANNING CHAIN...');
        startHolderPolling();
    };
}

function updateSparkline() {
    if (holderHistory.length < 2) return;
    sparklineContainer.style.opacity = '1';
    var ctx = document.getElementById('sparkline').getContext('2d');
    if (sparklineChart) sparklineChart.destroy();
    sparklineChart = new Chart(ctx, {
        type: 'line',
        data: { labels: holderHistory.map(function(_, i) { return i.toString(); }),
            datasets: [{ data: holderHistory, borderColor: '#FFB800',
                backgroundColor: 'rgba(255,184,0,0.08)', borderWidth: 2, fill: true,
                tension: 0.35, pointRadius: 0, pointHoverRadius: 4, pointHoverColor: '#CC0000' }]
        },
        options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            animation: { duration: 400 } }
    });
}

function updateDelta(current) {
    if (initialHolderCount === null) return;
    var delta = current - initialHolderCount;
    if (delta > 0) { deltaText.textContent = '+' + delta + ' since you arrived'; deltaText.className = 'delta-display delta-positive'; }
    else if (delta < 0) { deltaText.textContent = delta + ' since you arrived'; deltaText.className = 'delta-display delta-negative'; }
    else { deltaText.textContent = 'Holding steady'; deltaText.className = 'delta-display'; }
    deltaText.style.opacity = '1'; deltaText.onclick = null; deltaText.style.cursor = 'default';
}

/* === Fetch holder count INSTANTLY via DexScreener /tokens/v1/solana API (Issue 1) ===
   Returns integer holder count. Falls back to 24h buys if holders undefined. */
async function fetchHolderCount() {
    var resp = await fetch(DEX_HOLDERS_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('No pairs');
    // Pick the most liquid pair (highest liquidity) for a stable number
    var pair = data[0];
    for (var i = 1; i < data.length; i++) {
        var l0 = (pair.liquidity && pair.liquidity.usd) || 0;
        var l1 = (data[i].liquidity && data[i].liquidity.usd) || 0;
        if (l1 > l0) pair = data[i];
    }
    // Primary: live holder count
    if (pair.info && typeof pair.info.holders === 'number' && pair.info.holders > 0) {
        return { count: Number(pair.info.holders), source: 'dex-holders' };
    }
    // Fallback: 24h buys as rough proxy
    if (pair.txns && pair.txns.h24 && typeof pair.txns.h24.buys === 'number' && pair.txns.h24.buys > 0) {
        return { count: Number(pair.txns.h24.buys), source: 'dex-txns24h' };
    }
    throw new Error('No holder data in response');
}

/* === Fetch + apply (with per-digit morph on change) === */
async function fetchHolders() {
    if (isFetchingHolders) return;
    isFetchingHolders = true;

    try {
        var res = await fetchHolderCount();
        var count = res.count;
        if (Number.isFinite(count) && count > 0) {
            holderRetries = 0;
            holderSource = res.source;
            console.log('[Holders] Success (' + res.source + '):', count);
            loadingDisplay.classList.add('hidden');

            var prev = holderCount;
            holderCount = count;
            if (initialHolderCount === null) initialHolderCount = count;

            if (prev === null) {
                setNumberTargets(count);
                setTimeout(function() { deltaText.style.opacity = '1'; }, 1200);
            } else if (prev !== count) {
                changeNumber(count, count > prev);
            }

            updateDelta(count);
            holderHistory.push(count);
            if (holderHistory.length > 20) holderHistory.shift();
            updateSparkline();
        } else {
            throw new Error('Invalid count');
        }
    } catch (e) {
        holderRetries += 1;
        console.error('[Holders] Fetch failed (attempt ' + holderRetries + '/' + HOLDER_RETRY_CAP + '):', e.message);
        if (holderRetries >= HOLDER_RETRY_CAP) {
            console.error('[Holders] Retry cap reached.');
            if (holderPollInterval) { clearInterval(holderPollInterval); holderPollInterval = null; }
            showHolderFailedUI();
        } else {
            if (holderCount === null) setScanningText('RETRYING... ' + holderRetries + '/' + HOLDER_RETRY_CAP);
        }
    }

    isFetchingHolders = false;
}

/* === POLLING CONTROL (Issue 1: poll every 15s) === */
function startHolderPolling() {
    if (holderPollInterval) { clearInterval(holderPollInterval); holderPollInterval = null; }
    fetchHolders();
    holderPollInterval = setInterval(fetchHolders, HOLDER_POLL_MS);
}

/* ============================================================
   STATS — DEXSCREENER
   ============================================================ */
var DEXSCREENER_URL = 'https://api.dexscreener.com/latest/dex/tokens/' + TOKEN_ADDR;
var mcapEl = document.getElementById('stat-mcap');
var volEl  = document.getElementById('stat-vol');
var priceEl = document.getElementById('stat-price');

function formatUSD(val) {
    if (val === null || val === undefined || isNaN(val)) return '$ --';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(2) + 'K';
    return '$' + val.toFixed(2);
}

async function fetchStats() {
    try {
        var response = await fetch(DEXSCREENER_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        var pairs = data.pairs;
        if (!pairs || pairs.length === 0) throw new Error('No pairs');
        var pair = pairs[0];
        var mc = pair.fdv || pair.marketCap;
        var vol = pair.volume ? pair.volume.h24 : null;
        var price = pair.priceUsd;
        console.log('[Stats] MCAP:', mc, 'VOL:', vol, 'PRICE:', price);

        gsap.fromTo([mcapEl, volEl, priceEl], { opacity: 0.3, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
        mcapEl.textContent = formatUSD(mc);
        volEl.textContent = formatUSD(vol);
        priceEl.textContent = '$' + (parseFloat(price) || 0).toFixed(6);
    } catch (err) {
        console.error('[Stats] Fetch failed:', err.message);
        mcapEl.textContent = '$ --';
        volEl.textContent = '$ --';
        priceEl.textContent = '$ --';
        setTimeout(fetchStats, 15000);
    }
}

/* ============================================================
   COPY CONTRACT
   ============================================================ */
function copyContract() {
    var addr = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
    var btn = document.getElementById('copy-btn');
    navigator.clipboard.writeText(addr).then(function() {
        btn.textContent = 'COPIED \u2713';
        btn.classList.add('copy-flash');
        console.log('[Copy] Address copied');
        setTimeout(function() {
            btn.textContent = 'COPY ADDRESS';
            btn.classList.remove('copy-flash');
        }, 2000);
    }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = addr;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = 'COPIED \u2713';
        btn.classList.add('copy-flash');
        setTimeout(function() {
            btn.textContent = 'COPY ADDRESS';
            btn.classList.remove('copy-flash');
        }, 2000);
    });
}

/* ============================================================
   GSAP SCROLL ANIMATIONS
   ============================================================ */
gsap.registerPlugin(ScrollTrigger);

gsap.from('.stat-panel', {
    scrollTrigger: { trigger: '#stats', start: 'top 80%' },
    duration: 0.8, opacity: 0, y: 60, stagger: 0.2, ease: 'power2.out'
});

gsap.from('#contract > *', {
    scrollTrigger: { trigger: '#contract', start: 'top 80%' },
    duration: 0.8, opacity: 0, y: 40, stagger: 0.15, ease: 'power2.out'
});

gsap.from('.step-card', {
    scrollTrigger: { trigger: '#how-to-buy', start: 'top 75%' },
    duration: 0.8, opacity: 0, y: 80, stagger: 0.25, ease: 'power3.out'
});

/* ============================================================
   INIT
   ============================================================ */
console.log('%c$ANSEM THE BLACK BULL', 'font-size:24px;color:#FFB800;font-weight:bold;');
console.log('%cThe charge never stops.', 'color:#CC0000;');

// Issue 1: fire the instant holder fetch FIRST, before Three.js init, so the
// number can paint within ~3s. initThree() will paint it as soon as ready.
fetchHolders();

function bootThree() {
    initThree();
    if (holderCount !== null) setNumberTargets(holderCount);
}

if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(bootThree);
} else {
    setTimeout(bootThree, 1000);
}

// Stats every 30s
setInterval(fetchStats, 30000);
// Initial stats fetch
setTimeout(fetchStats, 2000);
