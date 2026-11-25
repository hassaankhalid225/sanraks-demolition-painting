/* SANRAKS — a concrete tower that comes down and goes back up painted */
(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stripes(){
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'); g.fillStyle = '#FFD400'; g.fillRect(0,0,128,128);
    g.fillStyle = '#000'; for (var i=-128;i<256;i+=32){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+16,0); g.lineTo(i+16-128,128); g.lineTo(i-128,128); g.closePath(); g.fill(); }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  function build(canvas){
    var mini = canvas.getAttribute('data-scene') === 'mini';
    var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, .1, 200);
    scene.fog = new THREE.Fog(0x000000, 38, 70);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, .45));
    var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(14,24,10); key.castShadow = true;
    key.shadow.mapSize.set(1024,1024); var s = key.shadow.camera; s.left=-16; s.right=16; s.top=20; s.bottom=-16; s.far=70;
    scene.add(key);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(120,120), new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:.95}));
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    var tex = stripes(); tex.repeat.set(8,.5);
    var hz = new THREE.MeshStandardMaterial({map:tex, roughness:.8});
    [[0,-7.5,15,.6],[0,7.5,15,.6],[-7.5,0,.6,15],[7.5,0,.6,15]].forEach(function(b){
      var m = new THREE.Mesh(new THREE.BoxGeometry(b[2],.6,b[3]), hz); m.position.set(b[0],.3,b[1]); m.castShadow = true; scene.add(m);
    });

    // tower made of cubes
    var NX = 4, NZ = 4, NY = mini ? 12 : 14, S = 1;
    var cells = [];
    for (var y=0;y<NY;y++) for (var x=0;x<NX;x++) for (var z=0;z<NZ;z++){
      var edge = x===0||x===NX-1||z===0||z===NZ-1;
      if (!edge) continue;
      var win = (y%3===1) && ((x===1||x===2) || (z===1||z===2)) && y>0;
      if (win && Math.random() > .15) continue;
      cells.push({home:new THREE.Vector3((x-(NX-1)/2)*S, y*S+S/2, (z-(NZ-1)/2)*S), y:y});
    }
    var count = cells.length;
    var geo = new THREE.BoxGeometry(.96,.96,.96);
    var mat = new THREE.MeshStandardMaterial({roughness:.85, metalness:0});
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    var concrete = [0x8A8A85,0x9A9A94,0x7D7D78,0xA4A39C].map(function(h){ return new THREE.Color(h); });
    var paints = [[0x2B59FF,0xFFFFFF,0xFFD400],[0xFFFFFF,0x2B59FF,0x2B59FF],[0xFF5A1F,0xFFFFFF,0x111111]].map(function(set){ return set.map(function(h){ return new THREE.Color(h); }); });
    var paintIndex = -1;
    cells.forEach(function(c){
      c.pos = c.home.clone(); c.vel = new THREE.Vector3(); c.rot = new THREE.Euler(); c.av = new THREE.Vector3();
      c.color = concrete[Math.floor(Math.random()*concrete.length)].clone(); c.target = c.color.clone();
      c.from = new THREE.Vector3(); c.fromRot = new THREE.Euler();
    });

    var state = 'standing', stateT = 0;
    var dummy = new THREE.Object3D();
    var status = document.querySelector('[data-demo-status]');
    function say(t){ if (status) status.textContent = t; }

    function demolish(){
      if (state !== 'standing') return;
      state = 'falling'; stateT = 0; say('Controlled demolition in progress');
      cells.forEach(function(c){
        var out = new THREE.Vector3(c.home.x, 0, c.home.z).normalize();
        c.delay = (c.y/NY)*.25 + Math.random()*.25;
        c.vel.set(out.x*(2+Math.random()*3) + (Math.random()-.5), Math.random()*2, out.z*(2+Math.random()*3) + (Math.random()-.5));
        c.av.set((Math.random()-.5)*6,(Math.random()-.5)*6,(Math.random()-.5)*6);
        c.landed = false;
      });
    }
    function rebuild(){
      if (state !== 'fallen') return;
      state = 'rebuilding'; stateT = 0;
      paintIndex = (paintIndex + 1) % (paints.length + 1);
      var set = paintIndex < paints.length ? paints[paintIndex] : null;
      say(set ? 'Rebuilding with a fresh coat of paint' : 'Back to bare concrete');
      cells.forEach(function(c){
        c.from.copy(c.pos); c.fromRot.copy(c.rot);
        c.delay = (c.y/NY)*1.1 + Math.random()*.15;
        if (set) { var band = Math.floor(c.y/2) % 3; c.target = set[band].clone(); }
        else c.target = concrete[Math.floor(Math.random()*concrete.length)].clone();
      });
    }
    var bDemo = document.querySelector('[data-demolish]'), bBuild = document.querySelector('[data-rebuild]');
    if (bDemo) bDemo.addEventListener('click', demolish);
    if (bBuild) bBuild.addEventListener('click', rebuild);
    canvas.addEventListener('click', function(){ if (state==='standing') demolish(); else if (state==='fallen') rebuild(); });

    function size(){
      var w = canvas.clientWidth||1, h = canvas.clientHeight||1;
      renderer.setSize(w,h,false); camera.aspect = w/h; camera.fov = (w/h) < .9 ? 44 : 34; camera.updateProjectionMatrix();
    }
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);

    var last = performance.now(), t = 0, auto = reduce ? Infinity : (mini ? 2 : 2.8), idle = 0;
    function ease(x){ return x<.5 ? 2*x*x : 1-Math.pow(-2*x+2,2)/2; }
    function frame(now){
      requestAnimationFrame(frame);
      var dt = Math.min((now-last)/1000, .05); last = now;
      if (!visible) return;
      t += dt; stateT += dt;
      if (state === 'standing' || state === 'fallen') { idle += dt; if (idle > auto) { idle = 0; state === 'standing' ? demolish() : rebuild(); auto = mini ? 3 : 4.5; } }
      else idle = 0;

      for (var i=0;i<count;i++){
        var c = cells[i];
        if (state === 'falling' && stateT > c.delay && !c.landed){
          c.vel.y -= 22*dt;
          c.pos.addScaledVector(c.vel, dt);
          c.rot.x += c.av.x*dt; c.rot.y += c.av.y*dt; c.rot.z += c.av.z*dt;
          if (c.pos.y < .48){ c.pos.y = .48; c.vel.y *= -.25; c.vel.x *= .6; c.vel.z *= .6; c.av.multiplyScalar(.5);
            if (Math.abs(c.vel.y) < .6){ c.landed = true; c.rot.x = Math.round(c.rot.x/(Math.PI/2))*(Math.PI/2); c.rot.z = Math.round(c.rot.z/(Math.PI/2))*(Math.PI/2); } }
        }
        if (state === 'rebuilding'){
          var k = Math.min(Math.max((stateT - c.delay)/.7, 0), 1), e = ease(k);
          c.pos.lerpVectors(c.from, c.home, e);
          c.pos.y += Math.sin(e*Math.PI)*2.2;
          c.rot.set(c.fromRot.x*(1-e), c.fromRot.y*(1-e), c.fromRot.z*(1-e));
          if (k > .6) c.color.lerp(c.target, .2);
        }
        dummy.position.copy(c.pos); dummy.rotation.copy(c.rot); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, c.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (state === 'falling' && stateT > 3.2){ state = 'fallen'; say('Site cleared. Click to rebuild'); }
      if (state === 'rebuilding' && stateT > 2.6){ state = 'standing'; cells.forEach(function(c){ c.pos.copy(c.home); c.rot.set(0,0,0); c.color.copy(c.target); }); say('Standing. Click the tower to bring it down'); }

      var a = (reduce ? .8 : .8 + t*.08);
      var r = mini ? 40 : 46;
      camera.position.set(Math.sin(a)*r, mini ? 15 : 17, Math.cos(a)*r);
      camera.lookAt(0, mini ? 5 : 6, 0);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  function boot(){
    document.querySelectorAll('canvas[data-scene]').forEach(function(c){
      try { if (!window.THREE) throw new Error('three missing'); build(c); }
      catch (err) { c.parentElement.classList.add('no-webgl'); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
