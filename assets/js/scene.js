/* SANRAKS — a concrete tower that comes down and goes back up painted.
   Breaker-arm strike, hand-rolled rubble physics (gravity, bounce, tumble, settle onto a heightfield pile),
   dust particles, camera shake, floor-by-floor snap rebuild and a paint-roller pass down the facade.
   Three.js r128 global build only. No other dependencies. */
(function () {
  'use strict';

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var scenes = window.SanraksScenes = [];

  /* ---------------- small maths ---------------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function eInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function eOut(t) { return 1 - Math.pow(1 - t, 3); }
  function eBack(t) { var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function fail(canvas) {
    var root = (canvas.closest && canvas.closest('[data-scene-root]')) || canvas.parentElement;
    if (root) root.classList.add('no-webgl');
    var story = canvas.closest && canvas.closest('[data-story]');
    if (story) {
      story.classList.add('no-webgl');
      var st = story.querySelector('[data-demo-status]');
      if (st) st.textContent = 'Static view. The interactive 3D tower needs WebGL';
    }
  }

  /* ---------------- procedural textures ---------------- */
  function canvasTex(c, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function concreteTexture(size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var g = c.getContext('2d'), r = rng(11), i, ox, oy;
    g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
    function wrapArc(x, y, rad) {
      for (ox = -1; ox <= 1; ox++) for (oy = -1; oy <= 1; oy++) {
        var px = x + ox * size, py = y + oy * size;
        if (px + rad < 0 || py + rad < 0 || px - rad > size || py - rad > size) continue;
        g.beginPath(); g.arc(px, py, rad, 0, 6.2832); g.fill();
      }
    }
    for (i = 0; i < size * 1.4; i++) {
      var v = (95 + r() * 75) | 0;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.08)';
      wrapArc(r() * size, r() * size, 3 + r() * size * .11);
    }
    var img = g.getImageData(0, 0, size, size), d = img.data;
    for (i = 0; i < d.length; i += 4) { var n = d[i] + (r() - .5) * 34; d[i] = d[i + 1] = d[i + 2] = n < 0 ? 0 : n > 255 ? 255 : n; }
    g.putImageData(img, 0, 0);
    for (i = 0; i < size * .8; i++) {
      g.fillStyle = 'rgba(18,18,18,' + (.25 + r() * .5).toFixed(2) + ')';
      wrapArc(r() * size, r() * size, (.5 + r() * 1.5) * size / 512);
    }
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (i = 0; i < 4; i++) g.fillRect(0, (i * size / 4 + size / 8) | 0, size, Math.max(1, size / 300));
    var t = canvasTex(c, false); t.anisotropy = 4; return t;
  }

  function hazardTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'); g.fillStyle = '#FFD400'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#0b0b0b';
    for (var i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - 128, 128); g.lineTo(i - 128, 128); g.closePath(); g.fill(); }
    return canvasTex(c, true);
  }

  function asphaltTexture() {
    var s = 256, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'), r = rng(5);
    g.fillStyle = '#262626'; g.fillRect(0, 0, s, s);
    var img = g.getImageData(0, 0, s, s), d = img.data;
    for (var i = 0; i < d.length; i += 4) { var n = 38 + (r() - .5) * 26 + (r() > .985 ? 40 : 0); d[i] = d[i + 1] = d[i + 2] = n; }
    g.putImageData(img, 0, 0);
    return canvasTex(c, true);
  }

  function backdropTexture() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 512;
    var g = c.getContext('2d');
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 512, 512);
    var a = g.createRadialGradient(370, 120, 10, 370, 120, 360);
    a.addColorStop(0, 'rgba(255,196,96,.20)'); a.addColorStop(1, 'rgba(255,196,96,0)');
    g.fillStyle = a; g.fillRect(0, 0, 512, 512);
    var b = g.createRadialGradient(60, 470, 10, 60, 470, 320);
    b.addColorStop(0, 'rgba(43,89,255,.16)'); b.addColorStop(1, 'rgba(43,89,255,0)');
    g.fillStyle = b; g.fillRect(0, 0, 512, 512);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  /* ---------------- materials ---------------- */
  // Instanced chunk material: triplanar concrete in chunk-local space, two paint layers split by a
  // world-height roll line (the roller), darkened chunk edges.
  function chunkMaterial(concTex, rollUniform) {
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, metalness: 0 });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uConc = { value: concTex };
      sh.uniforms.uRollY = rollUniform;
      sh.uniforms.uConcCol = { value: lin(0x9d998f) };
      sh.vertexShader =
        'attribute vec3 aColA;\nattribute vec3 aColB;\nattribute vec2 aPaint;\nattribute float aTone;\n' +
        'varying vec3 vSkL;\nvarying vec3 vSkH;\nvarying vec3 vSkN;\nvarying float vSkY;\nvarying vec3 vSkA;\nvarying vec3 vSkB;\nvarying vec2 vSkP;\nvarying float vSkT;\n' +
        sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' +
          'vec3 skS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));\n' +
          'vSkL = position * skS; vSkH = skS * 0.5; vSkN = normal;\n' +
          'vSkY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;\n' +
          'vSkA = aColA; vSkB = aColB; vSkP = aPaint; vSkT = aTone;\n');
      sh.fragmentShader =
        'uniform sampler2D uConc;\nuniform float uRollY;\nuniform vec3 uConcCol;\n' +
        'varying vec3 vSkL;\nvarying vec3 vSkH;\nvarying vec3 vSkN;\nvarying float vSkY;\nvarying vec3 vSkA;\nvarying vec3 vSkB;\nvarying vec2 vSkP;\nvarying float vSkT;\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n' +
            'vec3 skN = abs(vSkN); skN /= (skN.x + skN.y + skN.z + 1e-4);\n' +
            'vec3 skLp = vSkL * 0.36;\n' +
            'float skTx = texture2D(uConc, skLp.zy + vec2(.13,.71)).r * skN.x + texture2D(uConc, skLp.xz + vec2(.57,.29)).r * skN.y + texture2D(uConc, skLp.xy).r * skN.z;\n' +
            'float skUse = step(uRollY, vSkY);\n' +
            'vec3 skPc = mix(vSkA, vSkB, skUse);\n' +
            'float skPa = mix(vSkP.x, vSkP.y, skUse);\n' +
            'vec3 skD = vSkH - abs(vSkL) + abs(vSkN) * 100.0;\n' +
            'float skE = smoothstep(0.0, 0.07, min(skD.x, min(skD.y, skD.z)));\n' +
            'vec3 skConc = uConcCol * vSkT * (0.42 + 1.15 * skTx);\n' +
            'vec3 skPaint = skPc * (0.9 + 0.2 * skTx);\n' +
            'float skWet = (1.0 - smoothstep(0.0, 0.35, vSkY - uRollY)) * skUse * skPa;\n' +
            'vec3 skCol = mix(skConc, skPaint, skPa) * mix(0.66, 1.0, skE);\n' +
            'diffuseColor.rgb = skCol + skWet * 0.06;\n')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' +
            'roughnessFactor = clamp(mix(0.97, 0.52, skPa) - skWet * 0.4, 0.15, 1.0);\n');
    };
    return m;
  }

  function glassMaterial() {
    var m = new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: .1, metalness: .55 });
    m.onBeforeCompile = function (sh) {
      sh.vertexShader = 'attribute float aLit;\nvarying float vSkLit;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkLit = aLit;');
      sh.fragmentShader = 'varying float vSkLit;\n' +
        sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.5, 0.16) * vSkLit * 1.4 + vec3(0.015, 0.025, 0.05);');
    };
    return m;
  }

  /* ---------------- post (desktop hero only) ---------------- */
  function makePost(renderer) {
    var rt = new THREE.WebGLMultisampleRenderTarget(4, 4, { format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding });
    rt.samples = 4;
    var mat = new THREE.ShaderMaterial({
      uniforms: { tD: { value: rt.texture }, uTime: { value: 0 }, uShake: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tD; uniform float uTime; uniform float uShake; uniform vec2 uRes; varying vec2 vUv;',
        'void main(){',
        '  vec2 c = vUv - 0.5; float d = dot(c, c);',
        '  float ca = 0.0009 + uShake * 0.012;',
        '  vec3 col = vec3(texture2D(tD, vUv + c * ca).r, texture2D(tD, vUv).g, texture2D(tD, vUv - c * ca).b);',
        '  col *= 1.0 - d * 0.85;',
        '  float n = fract(sin(dot(floor(vUv * uRes) + floor(uTime * 24.0) * 7.13, vec2(12.9898, 78.233))) * 43758.5453);',
        '  col += (n - 0.5) * 0.05;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'].join('\n'),
      depthTest: false, depthWrite: false
    });
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    var sc = new THREE.Scene(); sc.add(quad);
    var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
      setSize: function (w, h) { rt.setSize(w, h); mat.uniforms.uRes.value.set(w, h); },
      render: function (scene, camera, t, shake) {
        mat.uniforms.uTime.value = t; mat.uniforms.uShake.value = shake;
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null); renderer.render(sc, cam);
      }
    };
  }

  /* ---------------- paint schemes (the swatches shown on the site) ---------------- */
  var SCHEMES = [
    { name: 'signal blue', wall: 0x2B59FF, col: 0xF1F0EA, slab: 0xFFFFFF, acc: 0xFFD400 },
    { name: 'gallery white', wall: 0xF4F2EC, col: 0xE9E4D8, slab: 0xFFFFFF, acc: 0x2B59FF },
    { name: 'deep green', wall: 0x1F3B36, col: 0xE9E4D8, slab: 0xE9E4D8, acc: 0xFFD400 },
    { name: 'night black', wall: 0x1a1a1a, col: 0xFFD400, slab: 0xE9E4D8, acc: 0xFFD400 },
    { name: 'desert sand', wall: 0xE9E4D8, col: 0xFFFFFF, slab: 0xFFFFFF, acc: 0x1F3B36 }
  ].map(function (s) { return { name: s.name, wall: lin(s.wall), col: lin(s.col), slab: lin(s.slab), acc: lin(s.acc), hex: s.wall }; });
  var RAIL_RAW = lin(0x2a2a2a), REBAR = lin(0x7a3b1d);

  /* =========================================================================================== */
  function build(canvas) {
    var kind = canvas.getAttribute('data-scene');
    var hero = kind === 'hero';
    var mode = canvas.getAttribute('data-mode') || (hero ? 'hero' : 'cycle');
    var root = (canvas.closest && canvas.closest('[data-scene-root]')) || canvas.parentElement;
    var small = Math.min(window.innerWidth || 1200, (window.screen && window.screen.width) || 1200) < 760;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    var gl2 = renderer.capabilities.isWebGL2;
    var usePost = hero && !small && gl2 && !!THREE.WebGLMultisampleRenderTarget;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : (hero ? 2 : 1.5)));
    renderer.setClearColor(0x0b0b0b, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    var shadows = !small;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var post = usePost ? makePost(renderer) : null;

    var scene = new THREE.Scene();
    scene.background = backdropTexture();
    scene.fog = new THREE.Fog(0x0b0b0b, 48, 125);
    var camera = new THREE.PerspectiveCamera(34, 1, .1, 300);

    /* ---- lights: hard low sun, cool sky fill, signal-blue rim ---- */
    scene.add(new THREE.HemisphereLight(0xb9c3dc, 0x2a1d10, .5));
    var key = new THREE.DirectionalLight(0xfff0d8, 2.7);
    key.position.set(17, 20, 11);
    if (shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(hero ? 2048 : 1024, hero ? 2048 : 1024);
      var sc = key.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 70;
      key.shadow.bias = -0.0006; key.shadow.normalBias = .03;
    }
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x2B59FF, 1.5); rim.position.set(-18, 9, -14); scene.add(rim);

    /* ---- textures / shared mats ---- */
    var concTex = concreteTexture(small ? 256 : 512);
    var hzTex = hazardTexture();
    var rollU = { value: -1000 };
    var mats = {
      yellow: new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: .5, metalness: .2 }),
      black: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .8, metalness: .1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: .35, metalness: .75 }),
      hazard: new THREE.MeshStandardMaterial({ map: hzTex, roughness: .7 }),
      cab: new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: .1, metalness: .6 })
    };
    function mesh(geo, mat, x, y, z, parent, noShadow) {
      var me = new THREE.Mesh(geo, mat); me.position.set(x || 0, y || 0, z || 0);
      if (shadows && !noShadow) { me.castShadow = true; me.receiveShadow = true; }
      (parent || scene).add(me); return me;
    }
    function box(w, h, d, mat, x, y, z, parent, noShadow) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, noShadow); }

    /* ---- ground, site pad, plinth, markings ---- */
    var asph = asphaltTexture(); asph.repeat.set(36, 36);
    var ground = mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: asph, roughness: 1 }), 0, 0, 0, null, true);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = shadows;
    var padTex = concTex.clone(); padTex.needsUpdate = true; padTex.repeat.set(5, 4);
    var pad = box(26, .06, 22, new THREE.MeshStandardMaterial({ map: padTex, color: 0x6e6c67, roughness: .95 }), 0, .03, 0, null, true);
    pad.receiveShadow = shadows;
    var plinthTex = concTex.clone(); plinthTex.needsUpdate = true; plinthTex.repeat.set(3, .3);
    box(9.6, .3, 7.6, new THREE.MeshStandardMaterial({ map: plinthTex, color: 0x8a8781, roughness: .95 }), 0, .21, 0);
    var lineMat = new THREE.MeshStandardMaterial({ color: 0xFFD400, roughness: .8 });
    [[0, 9.2, 22, .18], [0, -9.2, 22, .18], [11, 0, .18, 18.4], [-11, 0, .18, 18.4]].forEach(function (l) { box(l[2], .02, l[3], lineMat, l[0], .07, l[1], null, true); });

    /* ---- hazard barriers (instanced) with taped posts ---- */
    var BX = 12.4, BZ = 10.4, bars = [];
    (function () {
      var s = 2.5, x, z;
      for (x = -BX; x <= BX + .01; x += s) { bars.push([x, -BZ, 0]); if (x < 5 || x > 10) bars.push([x, BZ, 0]); }
      for (z = -BZ + s; z <= BZ - s + .01; z += s) { bars.push([-BX, z, 1]); bars.push([BX, z, 1]); }
    })();
    var barTex = hzTex.clone(); barTex.needsUpdate = true; barTex.repeat.set(2.2, .9);
    var barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, .85, .5), new THREE.MeshStandardMaterial({ map: barTex, roughness: .7 }), bars.length);
    var dm = new THREE.Object3D();
    bars.forEach(function (b, i) { dm.position.set(b[0], .43, b[1]); dm.rotation.set(0, b[2] ? Math.PI / 2 : 0, 0); dm.updateMatrix(); barMesh.setMatrixAt(i, dm.matrix); });
    if (shadows) { barMesh.castShadow = true; barMesh.receiveShadow = true; }
    scene.add(barMesh);
    var tapeTex = hzTex.clone(); tapeTex.needsUpdate = true; tapeTex.repeat.set(26, .5);
    var tapeMat = new THREE.MeshStandardMaterial({ map: tapeTex, roughness: .6, side: THREE.DoubleSide });
    box(BX * 2, .16, .02, tapeMat, 0, 1.55, -BZ, null, true);
    box(.02, .16, BZ * 2, tapeMat, -BX, 1.55, 0, null, true);
    box(.02, .16, BZ * 2, tapeMat, BX, 1.55, 0, null, true);
    box(BX + 4.6, .16, .02, tapeMat, -BX + (BX + 4.6) / 2, 1.55, BZ, null, true);
    var postMat = mats.black;
    for (var pi = 0; pi < bars.length; pi += 2) box(.08, .8, .08, postMat, bars[pi][0], 1.25, bars[pi][1], null, true);
    // cones
    var coneMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.26, .75, 12), new THREE.MeshStandardMaterial({ color: 0xFF5A1F, roughness: .6 }), 6);
    [[6.2, 9.4], [8.2, 9.4], [10.2, 9.4], [-9, 7.5], [9.6, -8], [-6, -8.8]].forEach(function (p, i) { dm.position.set(p[0], .44, p[1]); dm.rotation.set(0, 0, 0); dm.updateMatrix(); coneMesh.setMatrixAt(i, dm.matrix); });
    if (shadows) coneMesh.castShadow = true;
    scene.add(coneMesh);
    // floodlight mast
    box(.18, 9, .18, mats.steel, -10.6, 4.5, -8.6);
    var lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2cc, emissiveIntensity: 2.2 });
    box(1.4, .5, .3, lampMat, -10.3, 9, -8.4, null, true).rotation.y = -.7;

    /* =================== the tower =================== */
    var R = rng(hero ? 42 : 7);
    var NF = hero ? (small ? 6 : 8) : (small ? 5 : 6);
    var W2 = 4, D2 = 3, FH = 1.55, ST = .24, BASE = .36, COL = .5;
    var TOP = BASE + NF * FH;
    var slabNX = small ? 2 : 3, slabNZ = 2, colSplit = (hero && !small) ? 2 : 1;
    var chunks = [], panes = [];

    function addChunk(role, floor, x, y, z, sx, sy, sz) {
      var tone = role === 'core' ? .5 : role === 'slab' ? 1.06 + R() * .06 : .84 + R() * .22;
      chunks.push({
        role: role, floor: floor, home: new THREE.Vector3(x, y, z), size: new THREE.Vector3(sx, sy, sz),
        half: new THREE.Vector3(sx / 2, sy / 2, sz / 2), pos: new THREE.Vector3(x, y, z), q: new THREE.Quaternion(),
        vel: new THREE.Vector3(), w: new THREE.Vector3(), from: new THREE.Vector3(), fromQ: new THREE.Quaternion(),
        tone: tone, released: true, sleeping: true, contact: false, landed: false, delay: 0, rdelay: 0, rnd: R()
      });
    }
    var xs = [-W2, -W2 / 3, W2 / 3, W2], zs = [-D2, 0, D2];
    var cols = [];
    xs.forEach(function (x) { cols.push([x, -D2]); cols.push([x, D2]); });
    cols.push([-W2, 0]); cols.push([W2, 0]);

    for (var f = 0; f < NF; f++) {
      var y0 = BASE + f * FH, ch = FH - ST, i, j;
      // columns
      cols.forEach(function (c) {
        for (var s = 0; s < colSplit; s++) addChunk('column', f, c[0], y0 + ch * (s + .5) / colSplit, c[1], COL, ch / colSplit - .01, COL);
      });
      // slab pieces
      var sw = (2 * W2 + .6) / slabNX, sd = (2 * D2 + .6) / slabNZ;
      for (i = 0; i < slabNX; i++) for (j = 0; j < slabNZ; j++)
        addChunk('slab', f, -W2 - .3 + sw * (i + .5), y0 + ch + ST / 2, -D2 - .3 + sd * (j + .5), sw - .03, ST, sd - .03);
      // core
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) addChunk('core', f, (i - .5) * (W2 - .9), y0 + ch / 2, (j - .5) * (D2 - .9), W2 - .92, ch - .02, D2 - .92);
      // front + back bays (3 each): spandrel + 2 panes
      for (i = 0; i < 3; i++) {
        var mx = (xs[i] + xs[i + 1]) / 2, bw = (xs[i + 1] - xs[i]) - COL;
        [D2, -D2].forEach(function (zf) {
          var sgn = zf > 0 ? 1 : -1;
          addChunk('spandrel', f, mx, y0 + .28, zf + sgn * .1, bw, .56, .26);
          for (var p = 0; p < 2; p++) panes.push({ floor: f, x: mx + (p - .5) * bw / 2, y: y0 + .56 + (ch - .56) / 2, z: zf + sgn * .02, sx: bw / 2 - .07, sy: ch - .6, sz: .06, nx: 0, nz: sgn, lit: R() > .74 ? 1 : 0, ord: R() });
        });
        if (f > 0 && ((f % 2 === 0) ? i !== 1 : i === 1)) {
          addChunk('balcony', f, mx, y0 + .09, D2 + .25 + .45, bw - .1, .18, .9);
          addChunk('rail', f, mx, y0 + .18 + .26, D2 + .25 + .88, bw - .1, .5, .06);
        }
      }
      // sides: one solid panel, one window bay
      [W2, -W2].forEach(function (xf) {
        var sgn = xf > 0 ? 1 : -1, bd = D2 - COL;
        addChunk('wall', f, xf + sgn * .1, y0 + ch / 2, -D2 / 2, .26, ch - .02, bd);
        addChunk('spandrel', f, xf + sgn * .1, y0 + .28, D2 / 2, .26, .56, bd);
        for (var p = 0; p < 2; p++) panes.push({ floor: f, x: xf + sgn * .02, y: y0 + .56 + (ch - .56) / 2, z: D2 / 2 + (p - .5) * bd / 2, sx: .06, sy: ch - .6, sz: bd / 2 - .07, nx: sgn, nz: 0, lit: R() > .62 ? 1 : 0, ord: R() });
      });
    }
    // roof: parapet, plant box, rebar stubs
    (function () {
      var rf = NF - 1, ph = .55, y = TOP + ph / 2, i;
      for (i = 0; i < 3; i++) {
        var mx = (xs[i] + xs[i + 1]) / 2 + 0, w = (2 * W2 + .6) / 3 - .03;
        mx = -W2 - .3 + w * (i + .5) + i * .015;
        addChunk('parapet', rf, mx, y, D2 + .17, w, ph, .24);
        addChunk('parapet', rf, mx, y, -D2 - .17, w, ph, .24);
      }
      [W2 + .17, -W2 - .17].forEach(function (x) { for (i = 0; i < 2; i++) addChunk('parapet', rf, x, y, -D2 + D2 * (i + .5), .24, ph, D2 - .05); });
      addChunk('core', rf, -1.2, TOP + .55, -.6, 2.2, 1.1, 1.6);
      var per = small ? 2 : 4;
      cols.forEach(function (c) {
        for (var k = 0; k < per; k++) {
          var a = k / per * 6.283 + .6;
          addChunk('rebar', rf, c[0] + Math.cos(a) * .14, TOP + .38, c[1] + Math.sin(a) * .14, .05, .76, .05);
        }
      });
    })();

    var COUNT = chunks.length;
    var chunkMat = chunkMaterial(concTex, rollU);
    var unit = new THREE.BoxGeometry(1, 1, 1);
    var cGeo = unit.clone();
    var aColA = new Float32Array(COUNT * 3), aColB = new Float32Array(COUNT * 3), aPaint = new Float32Array(COUNT * 2), aTone = new Float32Array(COUNT);
    cGeo.setAttribute('aColA', new THREE.InstancedBufferAttribute(aColA, 3));
    cGeo.setAttribute('aColB', new THREE.InstancedBufferAttribute(aColB, 3));
    cGeo.setAttribute('aPaint', new THREE.InstancedBufferAttribute(aPaint, 2));
    cGeo.setAttribute('aTone', new THREE.InstancedBufferAttribute(aTone, 1));
    var tower = new THREE.InstancedMesh(cGeo, chunkMat, COUNT);
    tower.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tower.frustumCulled = false;
    if (shadows) { tower.castShadow = true; tower.receiveShadow = true; }
    scene.add(tower);
    chunks.forEach(function (c, i) { aTone[i] = c.tone; });

    function paintFor(c, s) { // returns [color, amount]
      if (c.role === 'rebar') return [REBAR, 1];
      if (c.role === 'core') return [RAIL_RAW, 0];
      if (!s) return c.role === 'rail' ? [RAIL_RAW, 1] : [RAIL_RAW, 0];
      switch (c.role) {
        case 'wall': case 'spandrel': case 'parapet': return [s.wall, 1];
        case 'column': return [s.col, 1];
        case 'rail': return [s.acc, 1];
        default: return [s.slab, 1];
      }
    }
    function setLayer(arr, slot, s) {
      for (var i = 0; i < COUNT; i++) {
        var p = paintFor(chunks[i], s);
        arr[i * 3] = p[0].r; arr[i * 3 + 1] = p[0].g; arr[i * 3 + 2] = p[0].b;
        aPaint[i * 2 + slot] = p[1];
      }
      cGeo.attributes[slot ? 'aColB' : 'aColA'].needsUpdate = true;
      cGeo.attributes.aPaint.needsUpdate = true;
    }
    setLayer(aColA, 0, null); setLayer(aColB, 1, null);

    /* ---- glazing ---- */
    var PN = panes.length;
    var gGeo = unit.clone();
    var aLit = new Float32Array(PN);
    panes.forEach(function (p, i) { aLit[i] = p.lit; });
    gGeo.setAttribute('aLit', new THREE.InstancedBufferAttribute(aLit, 1));
    var glass = new THREE.InstancedMesh(gGeo, glassMaterial(), PN);
    glass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    glass.frustumCulled = false;
    scene.add(glass);

    /* ---- scaffold on the west face ---- */
    var scaf = [], scafPl = [];
    (function () {
      var xi = -W2 - 1.0, xo = -W2 - 2.0, zsS = [], z, L, m = new THREE.Object3D();
      for (z = -D2 - .4; z <= D2 + .41; z += (2 * D2 + .8) / 4) zsS.push(z);
      var len = 2 * D2 + .8;
      function push(arr, lvl, x, y, zz, sx, sy, sz, rx) {
        m.position.set(x, y, zz); m.rotation.set(rx || 0, 0, 0); m.scale.set(sx, sy, sz); m.updateMatrix();
        arr.push({ m: m.matrix.clone(), lvl: lvl });
      }
      for (L = 0; L < NF; L++) {
        var yb = BASE + L * FH;
        zsS.forEach(function (zz) {
          push(scaf, L, xi, yb + FH / 2, zz, .07, FH, .07);
          push(scaf, L, xo, yb + FH / 2, zz, .07, FH, .07);
          push(scaf, L, (xi + xo) / 2, yb + FH - .05, zz, 1.1, .06, .06);
        });
        push(scaf, L, xi, yb + FH - .05, 0, .06, .06, len);
        push(scaf, L, xo, yb + FH - .05, 0, .06, .06, len);
        push(scaf, L, xo, yb + FH * .55, 0, .06, .06, len);
        var seg = len / 4, diag = Math.sqrt(seg * seg + FH * FH);
        push(scaf, L, xo, yb + FH / 2, zsS[L % 4] + seg / 2, .05, diag, .05, (L % 2 ? 1 : -1) * Math.atan2(seg, FH));
        push(scafPl, L, (xi + xo) / 2, yb + FH, 0, 1.0, .06, len);
      }
    })();
    var scafMesh = new THREE.InstancedMesh(unit, mats.steel, scaf.length);
    var plMesh = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0xc99a2e, roughness: .85 }), scafPl.length);
    [scafMesh, plMesh].forEach(function (me) { me.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (shadows) { me.castShadow = true; me.receiveShadow = true; } scene.add(me); });
    var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    var scafShown = -1;
    function updateScaffold(t) {
      var lv = Math.ceil(t * NF - .001) - 1;
      if (lv === scafShown) return; scafShown = lv;
      scaf.forEach(function (s, i) { scafMesh.setMatrixAt(i, s.lvl <= lv ? s.m : ZERO); });
      scafPl.forEach(function (s, i) { plMesh.setMatrixAt(i, s.lvl <= lv ? s.m : ZERO); });
      scafMesh.instanceMatrix.needsUpdate = true; plMesh.instanceMatrix.needsUpdate = true;
    }

    /* ---- paint roller gondola on the south face ---- */
    var rig = new THREE.Group(); rig.visible = false; scene.add(rig);
    var RZ = D2 + 1.45, RL = 2 * W2 + .5;
    var rollerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
    var roller = mesh(new THREE.CylinderGeometry(.24, .24, RL, 18), rollerMat, 0, 0, 0, rig);
    roller.rotation.z = Math.PI / 2;
    box(RL + .3, .09, .09, mats.black, 0, 0, .34, rig);
    box(.09, .09, .4, mats.black, -RL / 2 - .1, 0, .17, rig); box(.09, .09, .4, mats.black, RL / 2 + .1, 0, .17, rig);
    box(RL + .5, .12, .85, mats.hazard, 0, -.75, .75, rig);
    box(RL + .5, .7, .04, mats.yellow, 0, -.4, 1.16, rig);
    var cables = [box(.03, 1, .03, mats.black, -RL / 2, 0, .75, rig, true), box(.03, 1, .03, mats.black, RL / 2, 0, .75, rig, true)];
    var davits = new THREE.Group(); davits.visible = false; scene.add(davits);
    box(.18, .18, 1.8, mats.steel, -RL / 2, TOP + 1.25, D2 + .75, davits); box(.18, .18, 1.8, mats.steel, RL / 2, TOP + 1.25, D2 + .75, davits);
    box(.18, 1.0, .18, mats.steel, -RL / 2, TOP + .75, D2 - .1, davits); box(.18, 1.0, .18, mats.steel, RL / 2, TOP + .75, D2 - .1, davits);
    function placeRig(y) {
      rig.position.set(0, y, RZ);
      var top = TOP + 1.2 - y;
      cables.forEach(function (c) { c.scale.y = Math.max(.01, top); c.position.y = top / 2 - .75; });
    }

    /* ---- long-reach demolition excavator ---- */
    var ex = (function () {
      var g = new THREE.Group();
      box(4.4, .8, .9, mats.black, 0, .4, 1.15, g); box(4.4, .8, .9, mats.black, 0, .4, -1.15, g);
      box(3.0, .3, 1.5, mats.steel, 0, .9, 0, g);
      var house = new THREE.Group(); house.position.y = 1.05; g.add(house);
      box(3.4, 1.1, 2.4, mats.yellow, -.4, .55, 0, house);
      box(1.0, 1.0, 2.42, mats.hazard, -2.4, .55, 0, house);
      box(1.3, 1.45, 1.0, mats.yellow, .95, 1.8, .72, house);
      box(.06, .75, .86, mats.cab, 1.62, 2.0, .72, house);
      box(1.1, .75, .06, mats.cab, .95, 2.0, 1.23, house);
      var b1 = new THREE.Group(); b1.position.set(.9, 1.3, -.35); house.add(b1);
      var L1 = 8.2, L2 = 6.2;
      box(L1, .58, .5, mats.yellow, L1 / 2, 0, 0, b1);
      box(L1 * .62, .2, .2, mats.steel, L1 * .38, -.44, 0, b1);
      var b2 = new THREE.Group(); b2.position.x = L1; b1.add(b2);
      box(L2, .44, .44, mats.yellow, L2 / 2, 0, 0, b2);
      box(L2 * .55, .16, .16, mats.steel, L2 * .45, .36, 0, b2);
      var tool = new THREE.Group(); tool.position.x = L2; b2.add(tool);
      box(1.5, .6, .6, mats.black, .75, 0, 0, tool);
      var chisel = mesh(new THREE.ConeGeometry(.15, .9, 10), mats.steel, 1.95, 0, 0, tool);
      chisel.rotation.z = -Math.PI / 2;
      scene.add(g);
      return { g: g, b1: b1, b2: b2, tool: tool, L1: L1, L2: L2, px: .9, py: 2.35 };
    })();
    var EXP = new THREE.Vector2(9.3, 5.6), EXT = new THREE.Vector2(3.6, 2.6);
    ex.g.position.set(EXP.x, 0, EXP.y);
    ex.g.rotation.y = Math.atan2(-(EXT.y - EXP.y), EXT.x - EXP.x);
    var exD = EXP.distanceTo(EXT);
    var impactPoint = new THREE.Vector3(EXT.x, TOP - 1.2, EXT.y);
    function poseArm(a, t) {
      var bob = reduce ? 0 : Math.sin(t * 1.3) * .25;
      var d = lerp(5.2, exD + .3, a), h = lerp(7.2 + bob, TOP - 1.1, a), toolAng = lerp(-1.45, -.45, a);
      var dx = d - ex.px, dy = h - ex.py, r = Math.sqrt(dx * dx + dy * dy);
      r = clamp(r, Math.abs(ex.L1 - ex.L2) + .05, ex.L1 + ex.L2 - .05);
      var phi = Math.atan2(dy, dx);
      var cb = clamp((ex.L1 * ex.L1 + r * r - ex.L2 * ex.L2) / (2 * ex.L1 * r), -1, 1);
      var a1 = phi + Math.acos(cb);
      var ex1 = ex.L1 * Math.cos(a1), ey1 = ex.L1 * Math.sin(a1);
      var a2 = Math.atan2(r * Math.sin(phi) - ey1, r * Math.cos(phi) - ex1);
      ex.b1.rotation.z = a1; ex.b2.rotation.z = a2 - a1; ex.tool.rotation.z = toolAng - a2;
    }

    /* ---- dust particles ---- */
    var DN = hero ? (small ? 260 : 1100) : (small ? 150 : 420);
    var dPos = new Float32Array(DN * 3), dA = new Float32Array(DN), dS = new Float32Array(DN);
    var dVel = new Float32Array(DN * 3), dLife = new Float32Array(DN), dMax = new Float32Array(DN), dS0 = new Float32Array(DN);
    var dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
    dGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dA, 1).setUsage(THREE.DynamicDrawUsage));
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dS, 1).setUsage(THREE.DynamicDrawUsage));
    var dMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uCol: { value: new THREE.Color(0.66, 0.61, 0.54) } },
      vertexShader: 'attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;\n' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); vA = aAlpha; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA;\n' +
        'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); a *= a * vA; if (a < 0.004) discard; gl_FragColor = vec4(uCol * (0.75 + 0.45 * (0.5 - d)), a); }',
      transparent: true, depthWrite: false
    });
    var dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; scene.add(dust);
    var dCursor = 0, dustLive = 0;
    function emit(x, y, z, n, spread, up, size, life) {
      if (reduce) return;
      for (var k = 0; k < n; k++) {
        var i = dCursor; dCursor = (dCursor + 1) % DN;
        var a = Math.random() * 6.283, s = spread * (.35 + Math.random() * .65);
        dPos[i * 3] = x + (Math.random() - .5) * .8; dPos[i * 3 + 1] = y + Math.random() * .5; dPos[i * 3 + 2] = z + (Math.random() - .5) * .8;
        dVel[i * 3] = Math.cos(a) * s; dVel[i * 3 + 1] = up * (.4 + Math.random() * .8); dVel[i * 3 + 2] = Math.sin(a) * s;
        dMax[i] = life * (.6 + Math.random() * .7); dLife[i] = dMax[i]; dS0[i] = size * (.6 + Math.random() * .8);
      }
      dustLive = 6;
    }
    function updateDust(dt) {
      if (dustLive <= 0) return;
      dustLive -= dt;
      var drag = Math.exp(-1.7 * dt);
      for (var i = 0; i < DN; i++) {
        if (dLife[i] <= 0) { if (dA[i] !== 0) { dA[i] = 0; dS[i] = 0; } continue; }
        dLife[i] -= dt;
        var k = 1 - dLife[i] / dMax[i];
        dVel[i * 3] *= drag; dVel[i * 3 + 2] *= drag; dVel[i * 3 + 1] = dVel[i * 3 + 1] * drag + .35 * dt;
        dPos[i * 3] += dVel[i * 3] * dt; dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt; dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        if (dPos[i * 3 + 1] < .1) dPos[i * 3 + 1] = .1;
        dA[i] = Math.sin(Math.min(1, k * 1.2) * Math.PI) * .5 * (1 - k * .4);
        dS[i] = dS0[i] * (1 + k * 2.2);
      }
      dGeo.attributes.position.needsUpdate = true; dGeo.attributes.aAlpha.needsUpdate = true; dGeo.attributes.aSize.needsUpdate = true;
    }

    /* =================== rubble physics =================== */
    var G = 26, HN = 64, HCELL = .5, HOFF = 16;
    var hf = new Float32Array(HN * HN);
    function hIdx(x, z) { var ix = Math.floor((x + HOFF) / HCELL), iz = Math.floor((z + HOFF) / HCELL); if (ix < 0 || iz < 0 || ix >= HN || iz >= HN) return -1; return iz * HN + ix; }
    function groundAt(x, z) {
      var base = (Math.abs(x) < 4.8 && Math.abs(z) < 3.8) ? BASE : .06;
      var i = hIdx(x, z); return i < 0 ? base : Math.max(base, hf[i]);
    }
    function stamp(c, top) {
      var e = rowAbs(c.q);
      var ex_ = Math.abs(e.c00) * c.half.x + Math.abs(e.c01) * c.half.y + Math.abs(e.c02) * c.half.z;
      var ez_ = Math.abs(e.c20) * c.half.x + Math.abs(e.c21) * c.half.y + Math.abs(e.c22) * c.half.z;
      for (var x = c.pos.x - ex_ * .8; x <= c.pos.x + ex_ * .8; x += HCELL) for (var z = c.pos.z - ez_ * .8; z <= c.pos.z + ez_ * .8; z += HCELL) {
        var i = hIdx(x, z); if (i >= 0 && hf[i] < top) hf[i] = top;
      }
    }
    var RM = {};
    function rowAbs(q) {
      var x = q.x, y = q.y, z = q.z, w = q.w;
      RM.c00 = 1 - 2 * (y * y + z * z); RM.c01 = 2 * (x * y - w * z); RM.c02 = 2 * (x * z + w * y);
      RM.c10 = 2 * (x * y + w * z); RM.c11 = 1 - 2 * (x * x + z * z); RM.c12 = 2 * (y * z - w * x);
      RM.c20 = 2 * (x * z - w * y); RM.c21 = 2 * (y * z + w * x); RM.c22 = 1 - 2 * (x * x + y * y);
      return RM;
    }
    var UP = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), axis = new THREE.Vector3();

    function prepFall() {
      hf.fill(0);
      var pushDir = new THREE.Vector2(EXP.x, EXP.y).normalize();
      for (var i = 0; i < COUNT; i++) {
        var c = chunks[i], fromTop = (NF - 1 - c.floor);
        c.released = false; c.sleeping = false; c.contact = false; c.landed = false;
        c.delay = fromTop * .085 + c.rnd * .07 + (c.role === 'rebar' || c.role === 'parapet' ? 0 : .02);
        var ox = c.home.x, oz = c.home.z, l = Math.sqrt(ox * ox + oz * oz) || 1;
        var out = (1.1 + Math.random() * 2.6) * (.55 + c.floor / NF * .9);
        c.vel.set(ox / l * out - pushDir.x * (1 + Math.random() * 1.5) * (c.floor / NF), Math.random() * 1.6 - .4, oz / l * out - pushDir.y * (1 + Math.random() * 1.5) * (c.floor / NF));
        var spin = 5 / (1 + c.size.x * c.size.y * c.size.z * 1.5);
        c.w.set((Math.random() - .5) * spin, (Math.random() - .5) * spin * .6, (Math.random() - .5) * spin);
      }
    }
    var floorPuffed = [];
    function stepPhysics(dt, t, silent) {
      var awake = 0, landedNow = 0;
      for (var i = 0; i < COUNT; i++) {
        var c = chunks[i];
        if (c.sleeping) continue;
        awake++;
        if (!c.released) {
          if (t < c.delay) continue;
          c.released = true;
          if (!silent && !floorPuffed[c.floor]) {
            floorPuffed[c.floor] = true;
            var yy = BASE + c.floor * FH;
            for (var k = 0; k < 4; k++) emit((k % 2 ? 1 : -1) * W2 * (.4 + Math.random() * .7), yy, (k < 2 ? 1 : -1) * D2, Math.round(DN * .018), 2.2, 1.2, 1.4, 2.4);
          }
        }
        c.vel.y -= G * dt;
        c.pos.addScaledVector(c.vel, dt);
        var wl = c.w.length();
        if (wl > 1e-4) { axis.copy(c.w).multiplyScalar(1 / wl); tq.setFromAxisAngle(axis, wl * dt); c.q.premultiply(tq); }
        // site boundary
        if (Math.abs(c.pos.x) > BX - 1) { c.pos.x = Math.sign(c.pos.x) * (BX - 1); c.vel.x *= -.3; }
        if (Math.abs(c.pos.z) > BZ - 1) { c.pos.z = Math.sign(c.pos.z) * (BZ - 1); c.vel.z *= -.3; }
        var m = rowAbs(c.q);
        var low = Math.abs(m.c10) * c.half.x + Math.abs(m.c11) * c.half.y + Math.abs(m.c12) * c.half.z;
        var gy = groundAt(c.pos.x, c.pos.z);
        if (c.pos.y - low <= gy) {
          c.pos.y = gy + low;
          if (c.vel.y < 0) {
            var imp = -c.vel.y;
            c.vel.y = imp > 2.2 ? imp * .3 : 0;
            c.vel.x *= .6; c.vel.z *= .6;
            c.w.multiplyScalar(.55);
            c.w.x += c.vel.z * .9 * (Math.random() - .3); c.w.z -= c.vel.x * .9 * (Math.random() - .3);
            if (!c.landed) { c.landed = true; landedNow++; if (!silent && imp > 6 && Math.random() < .35) emit(c.pos.x, gy, c.pos.z, 3, 1.6, .5, 1.1, 2); }
          }
          c.contact = true;
        } else c.contact = false;
        if (c.contact && c.vel.y === 0) {
          var fr = Math.exp(-5 * dt); c.vel.x *= fr; c.vel.z *= fr; c.w.multiplyScalar(Math.exp(-6 * dt));
          // flop onto the nearest flat face
          var hx = c.half.x, hy = c.half.y, hz = c.half.z, k2 = hx <= hy ? (hx <= hz ? 0 : 2) : (hy <= hz ? 1 : 2);
          var sgn = [m.c10, m.c11, m.c12][k2] >= 0 ? 1 : -1;
          if (k2 === 0) tv.set(m.c00, m.c10, m.c20); else if (k2 === 1) tv.set(m.c01, m.c11, m.c21); else tv.set(m.c02, m.c12, m.c22);
          tv.multiplyScalar(sgn).normalize();
          tq2.setFromUnitVectors(tv, UP).multiply(c.q);
          c.q.slerp(tq2, Math.min(1, dt * 7));
          if (c.vel.x * c.vel.x + c.vel.z * c.vel.z < .25 && c.w.lengthSq() < .3 && tv.y > .995) {
            c.q.copy(tq2); m = rowAbs(c.q);
            low = Math.abs(m.c10) * c.half.x + Math.abs(m.c11) * c.half.y + Math.abs(m.c12) * c.half.z;
            c.pos.y = groundAt(c.pos.x, c.pos.z) + low;
            c.sleeping = true; c.vel.set(0, 0, 0); c.w.set(0, 0, 0);
            stamp(c, c.pos.y + low * .85);
          }
        }
      }
      return { awake: awake, landed: landedNow };
    }

    /* =================== state machine =================== */
    var state = 'standing', st = 0, painted = false, schemeIdx = -1, pendingPaint = false, curScheme = null;
    var glassT = 0, glassTarget = 0, scafT = 0, scafTarget = 0, armT = 0, armTarget = 0;
    var queued = false, shake = 0, firstLand = false, idle = 0, autoCount = 0, floorsSnapped = [];
    var ctl = hero ? ((canvas.closest && canvas.closest('[data-story]')) || document) : root;
    var statusEl = ctl ? ctl.querySelector('[data-demo-status]') : null;
    function say(txt) { if (statusEl && statusEl.textContent !== txt) statusEl.textContent = txt; }
    function setState(s) { state = s; st = 0; if (root) root.setAttribute('data-state', s); if (ctl && ctl !== root && ctl.setAttribute) ctl.setAttribute('data-state', s); }
    function busy() { return state === 'strike' || state === 'falling' || state === 'rebuilding' || state === 'painting' || state === 'intro'; }
    function standingMsg() { return painted ? 'Painted in ' + curScheme.name + '. Click the tower to bring it down again' : 'Standing. Click the tower to bring it down'; }

    function demolish() {
      if (state === 'intro') { queued = true; return false; }
      if (state !== 'standing') return false;
      idle = 0;
      setState('strike'); say('Breaker arm in. Controlled demolition in progress');
      if (reduce) startFall();
      return true;
    }
    function startFall() {
      setState('falling'); prepFall(); floorPuffed = []; firstLand = false;
      glassTarget = 1; scafTarget = 0;
      if (!reduce) {
        shake = Math.max(shake, .7);
        emit(impactPoint.x, impactPoint.y, impactPoint.z, Math.round(DN * .12), 3.2, 1.4, 1.6, 2.6);
      } else {
        for (var n = 0; n < 420; n++) { var r = stepPhysics(1 / 60, n / 60, true); if (!r.awake) break; }
        finishFall();
      }
    }
    function finishFall() {
      chunks.forEach(function (c) { if (!c.sleeping) { c.sleeping = true; c.vel.set(0, 0, 0); c.w.set(0, 0, 0); } });
      setState('fallen'); glassT = glassTarget = 1; say('Site cleared. Click to rebuild');
    }
    function rebuild(withPaint) {
      if (state !== 'fallen') return false;
      idle = 0; pendingPaint = !!withPaint; floorsSnapped = [];
      chunks.forEach(function (c) {
        c.from.copy(c.pos); c.fromQ.copy(c.q);
        c.rdelay = c.floor * .11 + (c.role === 'column' ? 0 : c.role === 'slab' ? .06 : .1) + c.rnd * .06;
      });
      setState('rebuilding'); say('Rebuilding floor by floor');
      if (reduce) finishRebuild();
      return true;
    }
    function finishRebuild() {
      chunks.forEach(function (c) { c.pos.copy(c.home); c.q.set(0, 0, 0, 1); c.sleeping = true; });
      hf.fill(0);
      setState('standing'); glassTarget = 0;
      if (pendingPaint) { pendingPaint = false; paint(nextScheme()); }
      else say(standingMsg());
    }
    function nextScheme() { schemeIdx = (schemeIdx + 1) % SCHEMES.length; return SCHEMES[schemeIdx]; }
    function paint(s) {
      if (state !== 'standing') return false;
      idle = 0;
      setLayer(aColB, 1, s); curScheme = s; painted = !!s;
      if (s) rollerMat.color.copy(s.wall); else rollerMat.color.setRGB(.5, .49, .46);
      say(s ? 'Rolling on ' + s.name : 'Stripping back to bare concrete for prep');
      setState('painting');
      if (reduce) finishPaint(); else { rollU.value = TOP + .7; rig.visible = true; davits.visible = true; placeRig(TOP + .7); }
      return true;
    }
    function finishPaint() {
      aColA.set(aColB); for (var i = 0; i < COUNT; i++) aPaint[i * 2] = aPaint[i * 2 + 1];
      cGeo.attributes.aColA.needsUpdate = true; cGeo.attributes.aPaint.needsUpdate = true;
      rollU.value = -1000; rig.visible = false; davits.visible = false;
      setState('standing'); say(standingMsg());
    }
    function intro() {
      chunks.forEach(function (c) {
        c.from.set(c.home.x + (Math.random() - .5) * 3, c.home.y + 16 + c.floor * 1.2, c.home.z + (Math.random() - .5) * 3);
        c.fromQ.setFromEuler(new THREE.Euler(Math.random() * 2, Math.random() * 2, Math.random() * 2));
        c.pos.copy(c.from); c.q.copy(c.fromQ);
        c.rdelay = .9 + c.floor * .1 + (c.role === 'column' ? 0 : .06) + c.rnd * .06;
      });
      glassT = 1; glassTarget = 1; pendingPaint = false; floorsSnapped = [];
      setState('intro'); say('Raising the tower');
    }
    // canvas + buttons
    function primary() {
      if (state === 'standing') demolish();
      else if (state === 'fallen') rebuild(true);
    }
    function onRebuildBtn() {
      if (state === 'fallen') rebuild(true);
      else if (state === 'standing') paint(nextScheme());
    }
    var storyAct = 0;
    canvas.addEventListener('click', function () { if (!hero || storyAct === 0) primary(); });
    if (ctl) {
      var bD = ctl.querySelector('[data-demolish]'), bR = ctl.querySelector('[data-rebuild]');
      if (bD) bD.addEventListener('click', function () { if (state === 'standing') demolish(); });
      if (bR) bR.addEventListener('click', onRebuildBtn);
    }

    /* ---- initial state per mode ---- */
    setState('standing');
    if (mode === 'rubble') { startFallSilent(); }
    else if (hero && !reduce) intro();
    function startFallSilent() {
      setState('falling'); prepFall();
      for (var n = 0; n < 480; n++) { var r = stepPhysics(1 / 60, n / 60, true); if (!r.awake) break; }
      finishFall(); say('Site cleared. Click to rebuild');
    }
    if (mode === 'paint') scafTarget = scafT = 1;

    /* =================== sizing / visibility =================== */
    var vw = 1, vh = 1;
    function size() {
      vw = canvas.clientWidth || 1; vh = canvas.clientHeight || 1;
      renderer.setSize(vw, vh, false);
      camera.aspect = vw / vh;
      camera.fov = camera.aspect < .8 ? 50 : camera.aspect < 1.2 ? 42 : 34;
      camera.updateProjectionMatrix();
      var db = renderer.getDrawingBufferSize(new THREE.Vector2());
      dMat.uniforms.uScale.value = db.y / (2 * Math.tan(camera.fov * Math.PI / 360));
      if (post) post.setSize(db.x, db.y);
      kick();
    }
    var visible = true, running = false, last = 0, tt = 0;
    function kick() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[en.length - 1].isIntersecting; kick(); }, { rootMargin: '80px' }).observe(canvas);
    document.addEventListener('visibilitychange', kick);

    /* =================== camera =================== */
    var KEYS = [
      { az: .62, h: 9, r: 37, ly: 6.6 },
      { az: .1, h: 7.4, r: 22, ly: 7.4 },
      { az: -.66, h: 3.4, r: 31, ly: 6.4 },
      { az: -1.08, h: 12.5, r: 30, ly: 6 },
      { az: .36, h: 10.5, r: 35, ly: 7 }
    ];
    var camP = 0, camSm = { az: KEYS[0].az, h: KEYS[0].h, r: KEYS[0].r, ly: KEYS[0].ly };
    function placeCamera(dt) {
      var k, az, h, r, ly, ox = 0, oy = 0, portrait = camera.aspect < 1;
      if (hero) {
        var P = clamp(camP, 0, KEYS.length - 1);
        if (reduce) P = 0;
        var i0 = Math.min(KEYS.length - 2, Math.floor(P)), f = eInOut(clamp(P - i0, 0, 1));
        var A = KEYS[i0], B = KEYS[i0 + 1];
        az = lerp(A.az, B.az, f); h = lerp(A.h, B.h, f); r = lerp(A.r, B.r, f); ly = lerp(A.ly, B.ly, f);
        var sm = 1 - Math.exp(-dt * 6);
        camSm.az += (az - camSm.az) * sm; camSm.h += (h - camSm.h) * sm; camSm.r += (r - camSm.r) * sm; camSm.ly += (ly - camSm.ly) * sm;
        az = camSm.az + (reduce ? 0 : Math.sin(tt * .13) * .06); h = camSm.h; r = camSm.r; ly = camSm.ly;
        if (portrait) { r *= lerp(1.3, 1.45, clamp(P, 0, 1)); ly += .4; oy = lerp(.24, .2, clamp(P, 0, 1)); }
        else ox = -.17;
      } else {
        az = (mode === 'rubble' ? -.5 : .7) + (reduce ? 0 : tt * .06);
        h = mode === 'rubble' ? 6 : 8.5; r = mode === 'rubble' ? 30 : 27; ly = 4.6;
        if (portrait) r *= 1.15;
        if (mode === 'rubble') { if (portrait) oy = .2; else ox = -.2; }
      }
      k = state === 'fallen' || state === 'falling' ? 1 : 0;
      camera.position.set(Math.sin(az) * r, h, Math.cos(az) * r);
      if (shake > .002 && !reduce) {
        camera.position.x += (Math.sin(tt * 71) + Math.sin(tt * 37)) * shake * .35;
        camera.position.y += Math.sin(tt * 53) * shake * .4;
        camera.position.z += Math.cos(tt * 61) * shake * .3;
      }
      camera.lookAt(0, ly - k * .6, 0);
      if (ox || oy) camera.setViewOffset(vw, vh, ox * vw, oy * vh, vw, vh); else camera.clearViewOffset();
    }

    /* =================== frame =================== */
    var dummy = new THREE.Object3D(), mtx = new THREE.Matrix4(), sclV = new THREE.Vector3();
    function writeChunks() {
      for (var i = 0; i < COUNT; i++) {
        var c = chunks[i], p = c.pos;
        if (state === 'strike' && st > .2) { // shudder before release
          sclV.set((Math.random() - .5) * .04, 0, (Math.random() - .5) * .04);
          dummy.position.set(p.x + sclV.x, p.y, p.z + sclV.z);
        } else dummy.position.copy(p);
        mtx.compose(dummy.position, c.q, c.size);
        tower.setMatrixAt(i, mtx);
      }
      tower.instanceMatrix.needsUpdate = true;
    }
    var glassDrawn = -1;
    function writeGlass() {
      if (Math.abs(glassT - glassDrawn) < .0005) return; glassDrawn = glassT;
      for (var i = 0; i < PN; i++) {
        var p = panes[i], r = clamp(glassT * 1.7 - p.ord * .7, 0, 1);
        if (r >= .999) { glass.setMatrixAt(i, ZERO); continue; }
        var out = eOut(Math.min(1, r * 2.6)) * .7, drop = Math.pow(Math.max(0, r - .38) / .62, 2) * (p.y + 1.5);
        dummy.position.set(p.x + p.nx * out, p.y - drop, p.z + p.nz * out);
        dummy.rotation.set(p.nz * r * 1.3, 0, -p.nx * r * 1.3);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix(); glass.setMatrixAt(i, dummy.matrix);
      }
      glass.instanceMatrix.needsUpdate = true;
    }

    function storyControl() {
      var S = window.SanraksStory;
      if (!hero || !S || !S.ready) return;
      camP = S.p; storyAct = S.active;
      canvas.style.cursor = storyAct === 0 ? 'pointer' : 'default';
      var loc = S.local || [];
      glassTarget = 0; scafTarget = 0; armTarget = 0;
      if (storyAct === 1) glassTarget = clamp(((loc[1] || 0) - .12) * 1.6, 0, 1);
      if (storyAct === 2) { glassTarget = 1; armTarget = clamp((loc[2] || 0) / .45, 0, 1) * .82; }
      if (storyAct === 3) scafTarget = clamp((loc[3] || 0) * 1.9 - .15, 0, 1);
      if (storyAct === 4) scafTarget = 1;
      if (busy()) return;
      if (storyAct === 1) { if (state === 'fallen') rebuild(false); }
      else if (storyAct === 2) { if (state === 'standing' && (loc[2] || 0) >= .45) demolish(); }
      else if (storyAct === 3) { if (state === 'fallen') rebuild(false); else if (state === 'standing' && painted) paint(null); }
      else if (storyAct === 4) { if (state === 'fallen') { schemeIdx = SCHEMES.length - 1; rebuild(true); } else if (state === 'standing' && !painted) { schemeIdx = 0; paint(SCHEMES[0]); } }
    }

    function autoControl(dt) {
      if (hero || reduce) return;
      if (busy()) { idle = 0; return; }
      idle += dt;
      if (state === 'standing' && idle > (mode === 'paint' ? 3.2 : 2.8)) {
        idle = 0;
        if (mode === 'paint' && (autoCount++ % 3) !== 2) paint(nextScheme()); else demolish();
      } else if (state === 'fallen' && idle > (mode === 'rubble' ? 5 : 1.8)) { idle = 0; rebuild(true); }
    }

    function loop(now) {
      if (!visible || document.hidden) { running = false; return; }
      requestAnimationFrame(loop);
      var dt = Math.min((now - last) / 1000, .05); last = now;
      tt += dt; st += dt;

      storyControl();
      autoControl(dt);

      // state updates
      if (state === 'strike') {
        armTarget = 1;
        if (st > .5) startFall();
      } else if (state === 'falling') {
        var sub = dt > 1 / 50 ? 2 : 1, res;
        for (var s = 0; s < sub; s++) res = stepPhysics(dt / sub, st, false);
        if (res.landed && !firstLand) { firstLand = true; shake = Math.max(shake, .55); emit(0, .3, 0, Math.round(DN * .28), 7.5, .5, 2.2, 3.4); }
        if (res.landed) shake = Math.min(1, shake + res.landed * .006);
        if (!res.awake || st > 5) finishFall();
        if (st > .8) armTarget = 0;
      } else if (state === 'rebuilding' || state === 'intro') {
        var done = true;
        for (var i = 0; i < COUNT; i++) {
          var c = chunks[i], k = clamp((st - c.rdelay) / .55, 0, 1);
          if (k < 1) done = false;
          if (k <= 0) continue;
          var e = eBack(k), eh = eInOut(k);
          c.pos.lerpVectors(c.from, c.home, eh);
          if (state === 'rebuilding') c.pos.y += Math.sin(k * Math.PI) * (2 + c.rnd * 2);
          if (k > .7) c.pos.y = lerp(c.pos.y, c.home.y + (1 - e) * .5, (k - .7) / .3);
          c.q.copy(c.fromQ).slerp(tq.set(0, 0, 0, 1), eh);
          if (k >= 1 && !floorsSnapped[c.floor]) {
            floorsSnapped[c.floor] = true;
            if (!reduce) { shake = Math.max(shake, state === 'intro' ? .12 : .1); emit(c.home.x, BASE + c.floor * FH, c.home.z, 4, 1.6, .3, .9, 1.4); }
          }
        }
        if (done) {
          if (state === 'intro') { setState('standing'); glassTarget = 0; say(standingMsg()); if (queued) { queued = false; demolish(); } }
          else finishRebuild();
        }
      } else if (state === 'painting') {
        var dur = hero ? 2.1 : 1.8, kp = clamp(st / dur, 0, 1);
        var ry = lerp(TOP + .7, BASE - .4, eInOut(kp));
        rollU.value = ry; placeRig(ry);
        roller.rotation.x += dt * 9;
        if (kp >= 1) finishPaint();
      }
      if (state === 'falling' || state === 'fallen' || state === 'rebuilding' || state === 'intro') { glassTarget = 1; scafTarget = 0; }
      if (mode === 'paint' && (state === 'standing' || state === 'painting')) scafTarget = 1;

      glassT += (glassTarget - glassT) * (1 - Math.exp(-dt * (glassTarget > glassT ? 5 : 3)));
      scafT += (scafTarget - scafT) * (1 - Math.exp(-dt * 4));
      armT += (armTarget - armT) * (1 - Math.exp(-dt * (state === 'strike' ? 11 : 2.5)));
      if (reduce) { glassT = glassTarget; scafT = scafTarget; armT = armTarget; }
      shake *= Math.exp(-dt * 4.5);

      updateDust(dt);
      writeChunks(); writeGlass(); updateScaffold(scafT); poseArm(armT, tt);
      camP = (window.SanraksStory && window.SanraksStory.ready) ? window.SanraksStory.p : 0;
      placeCamera(dt);
      if (post) post.render(scene, camera, tt, shake); else renderer.render(scene, camera);
    }

    size();
    writeChunks(); writeGlass(); updateScaffold(scafT); poseArm(0, 0);

    var api = {
      state: function () { return state; }, painted: function () { return painted; },
      demolish: demolish, rebuild: rebuild, paint: function () { return paint(nextScheme()); }, canvas: canvas
    };
    scenes.push(api);
    return api;
  }

  function boot() {
    var list = document.querySelectorAll('canvas[data-scene]');
    var ok = false;
    try { var tc = document.createElement('canvas'); var tg = window.WebGLRenderingContext && (tc.getContext('webgl2') || tc.getContext('webgl')); ok = !!tg; var le = tg && tg.getExtension('WEBGL_lose_context'); if (le) le.loseContext(); } catch (e) { ok = false; }
    if (!ok) { for (var k = 0; k < list.length; k++) fail(list[k]); return; }
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      try { if (!window.THREE) throw new Error('three missing'); build(c); }
      catch (err) { fail(c); if (window.console && console.warn) console.warn('SANRAKS 3D disabled:', err && err.message); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
