'use strict';

(function() {
  var video     = document.createElement('video')
    , width     = 640
    , height    = 0
    , streaming = false
    , explode   = true;

  var useShader = false;

  var divider     = [32, 18]
    , boxes       = []
    , boxesM      = []
    , depthFactor = 150;

  var canvas  = document.createElement('canvas')
    , ctx     = canvas.getContext('2d');

  canvas.width  = divider[0];
  canvas.height = divider[1];

  navigator.getUserMedia = (
    navigator.getUserMedia        ||
    navigator.webkitGetUserMedia  ||
    navigator.mozGetUserMedia     ||
    navigator.msGetUserMedia
  );

  //
  // Material
  //

  var texture   = new THREE.Texture( video );

  var material = new THREE.ShaderMaterial(THREE.DotScreenShader);
  material.uniforms.tDiffuse.value = texture;
  material.uniforms.scale.value = 2.5;
//    , material  = new THREE.MeshBasicMaterial( { map: texture, overdraw: true } )

  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  let w = new THREE.MeshBasicMaterial({color: 0xFFFFFF});

  let materials = [
    w,
    w,
    w,
    w,
    material,
    material
  ];

  material = new THREE.MultiMaterial(materials);

  //
  // Renderer
  //

  var container = document.querySelector('#container')
    , renderer  = new THREE.WebGLRenderer({ antialias: true })
    , scene     = new THREE.Scene()

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xefefef);
  container.appendChild(renderer.domElement);

  //
  // Camera & Controls
  //

  var camera    = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 )
    , controls  = new THREE.OrbitControls(camera, renderer.domElement );

  camera.position.z = 1000;

  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = true;

  //
  // Composer & Effect
  //

  var composer  = new THREE.EffectComposer(renderer);

  if (useShader) {
    var effect    = new THREE.ShaderPass(THREE.DotScreenShader);

    composer.addPass(new THREE.RenderPass(scene, camera));

    effect.uniforms['scale'].value = 3;
    effect.renderToScreen = true;
    composer.addPass(effect);
  }

  window.addEventListener( 'resize', onWindowResize, false );

  function init() {
    if (navigator.getUserMedia) {
       navigator.getUserMedia (

          // constraints
          {
             video: true,
             audio: false
          },

          // successCallback
          function(localMediaStream) {
            video.setAttribute('autoplay', 'autoplay');
            video.src = window.URL.createObjectURL(localMediaStream);

            video.addEventListener('canplay', function(ev) {
              if (!streaming) {
                height = video.videoHeight / (video.videoWidth / width);

                // Firefox currently has a bug where the height can't be read from
                // the video, so we will make assumptions if this happens.

                if (isNaN(height)) {
                  height = width / (4/3);
                }

                video.setAttribute('width',    width);
                video.setAttribute('height',   height);

                streaming = true;

                var dw = width / divider[0]
                  , dh = height / divider[1];

                var di = 1 / divider[0];
                var dj = 1 / divider[1];

                for (var j = divider[1] - 1; j >= 0; j--) {
                  for (var i = 0; i < divider[0]; i++) {
                    var geometry = new THREE.BoxGeometry(dw, dh, dh);

                    [4, 5].forEach(function(m) {
                      geometry.faceVertexUvs[0][m * 2 + 0][0].set(i * di,       j * dj + dj);
                      geometry.faceVertexUvs[0][m * 2 + 0][1].set(i * di,       j * dj);
                      geometry.faceVertexUvs[0][m * 2 + 0][2].set(i * di + di,  j * dj + dj);

                      geometry.faceVertexUvs[0][m * 2 + 1][0].set(i * di,       j * dj);
                      geometry.faceVertexUvs[0][m * 2 + 1][1].set(i * di + di,  j * dj);
                      geometry.faceVertexUvs[0][m * 2 + 1][2].set(i * di + di,  j * dj + dj);
                    });


                    var boxM = new THREE.MeshBasicMaterial({color: 0x222222});
                    var mesh = new THREE.Mesh(geometry, boxM);

                    scene.add(mesh);

                    var box = new THREE.BoxHelper(mesh);
                    box.material.color.set(0x222222);

                    var g = new THREE.Group();
                    g.add(mesh);
                    g.add(box);

                    g.translateX((i - divider[0] / 2) * (dw + 0.005 * width));
                    g.translateY((j - divider[1] / 2) * (dh + 0.005 * height));

                    scene.add(g);

                    boxes.push(g);
                    boxesM.push(boxM);
                  }
                }

                /*var geometry = new THREE.BoxGeometry(width, height, height); //PlaneGeometry(width, height, 4, 4 );
                var mesh = new THREE.Mesh(geometry, material);

                geometry.faceVertexUvs[0].forEach(function(uv) {
                  console.log(uv);
                });

                scene.add(mesh);*/

                requestAnimationFrame(render);
              }
            }, false);
          },

          // errorCallback
          function(err) {
             console.log("The following error occured: " + err);
          }
       );
    } else {
       console.log("getUserMedia not supported");
    }
  }

  function computeDepth() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = [];
    let min = 1
      , max = 0;

    for (let i = 0; i < frame.data.length / 4; i++) {
      let r = frame.data[i * 4 + 0]
        , g = frame.data[i * 4 + 1]
        , b = frame.data[i * 4 + 2]
        , l = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      boxesM[i].color.set((r << 16) | (g << 8) | b);
      boxesM[i].needsUpdate = true;

      l = Math.min(1, l / 255.0);

      data.push(l);

      min = Math.min(min, l);
      max = Math.max(max, l);
    }

    for (let i = 0; i < data.length; i++) {
      let z = (data[i] - min) / (max - min);

      z = depthFactor * z - depthFactor / 2;
      z -= boxes[i].position.z;

      boxes[i].position.z += z * 0.1;
      boxes[i].updateMatrix();
    }
  }

  function render() {
    requestAnimationFrame(render);

    if (streaming) {
        texture.needsUpdate = true;
    }

    computeDepth();

    controls.update();

    if (useShader) {
      composer.render();
    }
    else {
      renderer.render(scene, camera);
    }
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    composer.setSize( window.innerWidth, window.innerHeight );
  }

  init();
})();

/*
 * Sources:
 *
 * - https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Taking_still_photos
 * - https://github.com/mrdoob/three.js/blob/master/examples/webgl_postprocessing.html
 */
