import * as THREE from 'three';
import GUI from 'lil-gui';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Setting up the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera( 90, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
document.body.appendChild( renderer.domElement );
window.addEventListener("click", onCanvasClick);

let cloth;
let center;

// Lighting
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xFFFFFF, 100000);
pointLight.position.set(0,250,0);
pointLight.castShadow = true; 
scene.add(pointLight);

// Constants
const SUBSTEPS = 8;
const dt = 1/60;
const subDt = dt/SUBSTEPS;
const gravity = new THREE.Vector3(0,-100,0);
const radius = 1;
const particles = [];
const spawnedParticles = [];
const springs = [];

const settings = {
    width: 100,
    length: 100,
    height: 0,
    restitution: 0.2,
    spConstant: 1000,
    ballMass: 20,
    damping: 0.5,
    ballRadius: 30,
    selfCollision: false,
    wireframe: false,
    state: "Pin cloth, balls fall on cloth"
};

// Controls
const controls = new OrbitControls( camera, renderer.domElement );

const keysHeld = {};
window.addEventListener('keydown', (e) => { keysHeld[e.code] = true; });
window.addEventListener('keyup',   (e) => { keysHeld[e.code] = false; });

function handleMovement(camera) {
    const speed = 1;
    const up = camera.up;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3();
    right.crossVectors(forward, up).normalize();

    if (keysHeld['KeyW']) {
        camera.position.add(forward.clone().multiplyScalar(speed));
        controls.target.add(forward.clone().multiplyScalar(speed))
    }
    if (keysHeld['KeyS']) {
        camera.position.add(forward.clone().multiplyScalar(-speed));
        controls.target.add(forward.clone().multiplyScalar(-speed));
    }
    if (keysHeld['KeyA']) {
        camera.position.add(right.clone().multiplyScalar(-speed));
        controls.target.add(right.clone().multiplyScalar(-speed));
    }
    if (keysHeld['KeyD']) {
        camera.position.add(right.clone().multiplyScalar(speed));
        controls.target.add(right.clone().multiplyScalar(speed));
    }
    if (keysHeld['KeyQ']) {
        camera.position.add(up.clone().multiplyScalar(speed));
        controls.target.add(up.clone().multiplyScalar(speed));
    }
    if (keysHeld['KeyE']) {
        camera.position.add(up.clone().multiplyScalar(-speed));
        controls.target.add(up.clone().multiplyScalar(-speed));
    }
}

const gui = new GUI();
const physicsFolder = gui.addFolder('Physics');

physicsFolder.add(gravity, 'y', -500, 0, 1).name('gravity');

physicsFolder.add(settings, 'spConstant', 0, 5000, 10).name('spring constant');

physicsFolder.add(settings, 'ballMass', 0, 100, 10).name('ball mass');

physicsFolder.add(settings, 'damping', 0, 1, 0.05);

physicsFolder.add(settings, 'restitution', 0, 1, 0.02);

physicsFolder.open();

const clothFolder = gui.addFolder('Cloth');

clothFolder.add(settings, 'width', 0, 250, 10);

clothFolder.add(settings, 'length', 0, 250, 10);

clothFolder.add(settings, 'height', 0, 250, 10);

clothFolder.add(settings, 'selfCollision').name('self-collision');

clothFolder.add(settings, 'wireframe');

clothFolder.add({reset: () => {
    if (settings.state ==  "Pin cloth, balls fall on cloth") {
        load_scene1();
    }
    else if (settings.state == "Unpin cloth, cloth falls down to ball") {
        load_scene2();
    }
}}, 'reset').name('Reset cloth');


clothFolder.open();

const ballFolder = gui.addFolder('Ball on the ground');

ballFolder.add(settings, 'ballRadius', 0, 50, 5).onFinishChange(()=> {load_scene2()});

ballFolder.hide();

const sceneFolder = gui.addFolder('Scene');

sceneFolder.add(settings, 'state', ["Pin cloth, balls fall on cloth", "Unpin cloth, cloth falls down to ball"]).onChange(() => {
    if (settings.state == "Pin cloth, balls fall on cloth"){
        load_scene1();
        ballFolder.hide();
        window.addEventListener("click",onCanvasClick);
    }
    else if (settings.state == "Unpin cloth, cloth falls down to ball"){
        load_scene2();
        ballFolder.show();
        ballFolder.open();
        window.removeEventListener("click", onCanvasClick);
    }
});

sceneFolder.open();

function onCanvasClick(event){
    const pos = new THREE.Vector3(center.x + Math.random() * 20 - 10, center.y + 100, center.z  + Math.random() * 20 - 10);
    create_particle(pos, true, 10, false);
}
// Physics functions

function create_particle(pos, isMoving, r = radius, inCloth = true) {
    const geometry = new THREE.SphereGeometry( r, 32, 16);
    const material = new THREE.MeshStandardMaterial( { color: 0x808080} );
    const particle_mesh = new THREE.Mesh( geometry, material );
    particle_mesh.position.copy(pos);
    const particle= {
        mesh: particle_mesh,
        pos: particle_mesh.position,
        prevPos: particle_mesh.position.clone(),
        accel: gravity.clone(),
        radius: r,
        mass: inCloth? r / 10 : settings.ballMass,
        isMoving: isMoving
    };
    if (inCloth) {
        particles.push(particle);
    }
    else {
        spawnedParticles.push(particle);
        scene.add(particle_mesh);
    }
    return particle;
}

function create_spring(b1, b2){
    const initLength = b1.pos.distanceTo(b2.pos);
    const spring = {
        initLength: initLength,
        b1: b1,
        b2: b2,
    };
    springs.push(spring);
}

function apply_verlet(pos, prevPos, a, dt) {
    let changeDueToAcceleration = a.clone().multiplyScalar(dt **2);
    let delta = pos.clone().sub(prevPos);
    pos.add(changeDueToAcceleration).add(delta);
    prevPos.add(delta);
} 

function apply_constraint(radius, planePos, pos, prevPos) {
    if (pos.y - radius <= planePos.y){
        let temp = pos.y;
        let ogVel = temp - prevPos.y;

        pos.y = planePos.y + radius;
        prevPos.y = pos.y + ogVel*settings.restitution ;
    }
}

function apply_spring(spring) {  
    let currLength = spring.b2.pos.distanceTo(spring.b1.pos);
    if (currLength < 0.01){
        return;
    }
    let delta = currLength - spring.initLength;
    let dir = spring.b2.pos.clone().sub(spring.b1.pos).normalize();
    let spForce= settings.spConstant * delta;

    let totalForce = spForce;

    spring.b1.accel.add(dir.clone().multiplyScalar(totalForce));
    spring.b2.accel.sub(dir.clone().multiplyScalar(totalForce));
}


function apply_spring_damping(spring) {
    let dir = spring.b2.pos.clone().sub(spring.b1.pos).normalize();
    let v1 = spring.b1.pos.clone().sub(spring.b1.prevPos);
    let v2 = spring.b2.pos.clone().sub(spring.b2.prevPos);
    let relVel = v2.clone().sub(v1).dot(dir);

    let correction = dir.clone().multiplyScalar(relVel * settings.damping * 0.5);
    if (spring.b1.isMoving) spring.b1.prevPos.sub(correction.clone());
    if (spring.b2.isMoving) spring.b2.prevPos.add(correction.clone());
}


function apply_collisions(particles) {
    for(let i = 0; i < particles.length - 1; i++){
        for(let j = i + 1; j < particles.length; j++){
            const p1 = particles[i];
            const p2 = particles[j];

            let collision_axis = p2.pos.clone().sub(p1.pos);
            let dist = collision_axis.length();
            if (dist < 0.01) {
                continue;
            }

            if (dist > p1.radius + p2.radius) {
                continue;
            }

            if (dist < p1.radius + p2.radius) {
                const delta = p1.radius + p2.radius - dist;
                const normal = collision_axis.clone().divideScalar(dist);
                
                const share1 = p1.isMoving? delta / 2 : 0;
                const share2 = p2.isMoving? delta / 2 : 0;

                p1.pos.sub(normal.clone().multiplyScalar(share1));
                p2.pos.add(normal.clone().multiplyScalar(share2));

                const v1 = particles[i].pos.clone().sub(p1.prevPos);
                const v2 = particles[j].pos.clone().sub(p2.prevPos);

                const v1n = normal.clone().multiplyScalar(v1.dot(normal));
                const v2n = normal.clone().multiplyScalar(v2.dot(normal));

                const prevPosCorrection1 = p1.isMoving? settings.restitution : 1;
                const prevPosCorrection2 = p2.isMoving? settings.restitution : 1;
                
                p1.prevPos = p1.pos.clone().sub(
                    v1.sub(v1n).add(v2n.clone().multiplyScalar(prevPosCorrection1))
                );
                p2.prevPos = p2.pos.clone().sub(
                    v2.sub(v2n).add(v1n.clone().multiplyScalar(prevPosCorrection2))
                );
            }
        }
    }
}

function apply_cross_collisions(groupA, groupB) {
    for (let i = 0; i < groupA.length; i++) {
        for (let j = 0; j < groupB.length; j++) {
            const a = groupA[i], b = groupB[j];
            
            let collision_axis = b.pos.clone().sub(a.pos);
            let dist = collision_axis.length();
            if (dist < 0.0001) continue;

            const minDist = a.radius + b.radius;
            if (dist > minDist) {
                continue;
            }

            const delta = minDist - dist;
            const normal = collision_axis.divideScalar(dist);
        
            const invMassA = 1 / a.mass;
            const invMassB = 1 / b.mass;
            const invMassSum = invMassA + invMassB;
            if (invMassSum < 1e-9) continue;

            const aShare = a.isMoving? invMassA / invMassSum : 0;
            const bShare = b.isMoving? invMassB / invMassSum : 0;

            const correctionA = normal.clone().multiplyScalar(delta * aShare);
            const correctionB = normal.clone().multiplyScalar(delta * bShare)

            if (a.isMoving){
                a.pos.sub(correctionA);
                a.prevPos.sub(correctionA);
            }
            if (b.isMoving) {
                b.pos.sub(correctionB);
                b.prevPos.sub(correctionB);
            }

            let v1 = a.pos.clone().sub(a.prevPos);
            let v2 = b.pos.clone().sub(b.prevPos);

            let v1n = v1.dot(normal);
            let v2n = v2.dot(normal);
            let relVel = v1n - v2n; 

            if (relVel > 0) {
                const impulse = -(1 + settings.restitution) * relVel / invMassSum;

                const impulseCorrectionA = a.isMoving? impulse * invMassA : 0;
                const impulseCorrectionB = b.isMoving? impulse * invMassB : 0;

                const vADelta = normal.clone().multiplyScalar(impulseCorrectionA);
                const vBDelta = normal.clone().multiplyScalar(impulseCorrectionB);

                a.prevPos.sub(vADelta);
                b.prevPos.add(vBDelta);
            }
            
        }
    }
}

function create_cloth(startPos, width, length, spLength, pinnedCorners = true) {
    let mapParticles = new Map();
    let positions = [];
    const step = spLength + 2 * radius;
    const numCols = Math.floor(width / step);
    const numRows = Math.floor(length / step);
    let rowIndex = 0;
    for(let y = startPos.z; y > startPos.z - length; y -= step) {
        let row = [];
        let colIndex = 0;
        for(let x = startPos.x; x < startPos.x + width; x+= step) {
            const key = `${x},${y}`;
            row.push(key);
            let isMoving = true;
            if (pinnedCorners && (colIndex == 0 || colIndex == numCols - 1) && (rowIndex == 0 || rowIndex == numRows - 1)) {
                isMoving = false;
            }
            colIndex++;
            mapParticles.set(key, create_particle(new THREE.Vector3(x,startPos.y,y), isMoving));
        }
        rowIndex++;
        positions.push(row);
    }

    for(let i = 0; i < positions.length; i++){
        for(let j = 0; j < positions[i].length - 1; j++){
            create_spring(mapParticles.get(positions[i][j]), mapParticles.get(positions[i][j+1]));
        }
    }
    
    for(let i = 0; i < positions.length -1; i++){
        for(let j = 0; j < positions[i].length; j++){
            create_spring(mapParticles.get(positions[i][j]), mapParticles.get(positions[i+1][j]));
        }
    }

    for(let i = 0; i < positions.length - 1; i++){
        for(let j = 0; j < positions[i].length - 1; j++){
            create_spring(mapParticles.get(positions[i][j]), mapParticles.get(positions[i+1][j+1]));
        }
    }
    
    for(let i = 1; i < positions.length; i++){
        for(let j = 0; j < positions[i].length-1; j++){
            create_spring(mapParticles.get(positions[i][j]), mapParticles.get(positions[i-1][j+1]));
        }
    }

    const cols = positions[0].length;
    const rows = positions.length;

    const posArray = new Float32Array(particles.length * 3);
    particles.forEach((p, i) => {
        posArray[i * 3]     = p.pos.x;
        posArray[i * 3 + 1] = p.pos.y;
        posArray[i * 3 + 2] = p.pos.z;
    });

    const indexArray = [];
    for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
            const a = i * cols + j;
            const b = i * cols + (j + 1);
            const c = (i + 1) * cols + j;
            const d = (i + 1) * cols + (j + 1);
            indexArray.push(a, c, b);
            indexArray.push(b, c, d);
        }
    }

    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage); 

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', posAttr);
    geometry.setIndex(indexArray);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        side: THREE.DoubleSide,
        wireframe: settings.wireframe
    });
    const cloth = new THREE.Mesh(geometry, material);
    cloth.castShadow = true;
    cloth.geometry.computeBoundingBox()
    scene.add(cloth);
    return cloth;
}

// Program functions
function animate() {
    if (!cloth) {
        renderer.render(scene, camera);
        return;
    }
    for (let s = 0; s < SUBSTEPS; s++) {
        particles.forEach(particle => { particle.accel = gravity.clone(); });
        spawnedParticles.forEach(particle => { particle.accel = gravity.clone(); }); 
        springs.forEach(spring => {apply_spring(spring);
                                    apply_spring_damping(spring);});
        particles.forEach(particle => {
            if (particle.isMoving) {
                apply_verlet(particle.pos, particle.prevPos, particle.accel, subDt);
                apply_constraint(particle.radius, plane.position, particle.pos, particle.prevPos);
            }
        });
        spawnedParticles.forEach(particle => {
            if (particle.isMoving) {
                apply_verlet(particle.pos, particle.prevPos, particle.accel, subDt);
                apply_constraint(particle.radius, plane.position, particle.pos, particle.prevPos);
            }
        });
        if (settings.selfCollision) {
            apply_collisions(particles);
        }
        apply_collisions(spawnedParticles);
        apply_cross_collisions(particles, spawnedParticles);

    }
    const pos = cloth.geometry.attributes.position;
    particles.forEach((p, i) => {
        pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    });
    pos.needsUpdate = true;
    cloth.geometry.computeVertexNormals();
    handleMovement(camera);
    controls.update();
    renderer.render( scene, camera );
}

function clear_scene() {
    if (cloth) {
        scene.remove(cloth);
        cloth.geometry.dispose();
        cloth.material.dispose();
    }
    spawnedParticles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
    });
    particles.length = 0;
    spawnedParticles.length = 0;
    springs.length = 0;
}

function load_scene1() {
    clear_scene();

    cloth = create_cloth(new THREE.Vector3(0, settings.height, 0), settings.width, settings.length, 2);

    center = new THREE.Vector3();
    cloth.geometry.computeBoundingBox();
    cloth.geometry.boundingBox.getCenter(center);


    camera.lookAt(center);
    controls.target.copy(center);

    controls.update();
}

function load_scene2(){
    clear_scene();

    cloth = create_cloth(new THREE.Vector3(0, settings.height, 0), settings.width, settings.length, 2, false);

    center = new THREE.Vector3();
    cloth.geometry.computeBoundingBox();
    cloth.geometry.boundingBox.getCenter(center);

    const ballPos = new THREE.Vector3(center.x, center.y - 50, center.z);
    create_particle(ballPos, false, settings.ballRadius, false);

    camera.lookAt(center);
    controls.target.copy(center);

    controls.update();
}


// Adding plane + cloth to the initial scene

const planeGeometry = new THREE.PlaneGeometry(5000,5000);
const planeMaterial = new THREE.MeshStandardMaterial( {color: 0x808080, side: THREE.DoubleSide});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.receiveShadow = true;
scene.add(plane);
plane.position.set(0,-100,0);
plane.rotation.x = Math.PI / 2;

cloth = create_cloth(new THREE.Vector3(0,settings.height,0), settings.width, settings.length, 2);

center = new THREE.Vector3();
cloth.geometry.boundingBox.getCenter(center);

camera.position.z += 200;
camera.position.y += 50;
camera.lookAt(center);
controls.target.copy(center);

const toCenter = new THREE.Vector3();
toCenter.subVectors(center, camera.position).normalize();

const distanceToCenter = camera.position.distanceTo(center);
camera.position.add(toCenter.multiplyScalar(distanceToCenter / 2));

controls.update();

