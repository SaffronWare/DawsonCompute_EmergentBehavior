import * as THREE from 'three';
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

// Lighting
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xFFFFFF, 100000);
pointLight.position.set(200,300,50);
pointLight.castShadow = true; 
scene.add(pointLight);


// Constants
const SUBSTEPS = 8;
const dt = 1/60;
const subDt = dt/SUBSTEPS;
const gravity = new THREE.Vector3(0,-100,0);
const radius = 1;
const restitution = 0.1;
const spConstant = 1000;
const dampingCoefficient = 1000;
const particles = [];
const springs = [];

// Movements
const controls = new OrbitControls( camera, renderer.domElement );

const keysHeld = {};
window.addEventListener('keydown', (e) => { keysHeld[e.code] = true; });
window.addEventListener('keyup',   (e) => { keysHeld[e.code] = false; });

function handleMovement(camera) {
    const speed = 2;
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

// Physics functions

function create_particle(pos, isMoving) {
    const geometry = new THREE.SphereGeometry( radius, 32, 16);
    const material = new THREE.MeshStandardMaterial( { color: 0x808080 } );
    const cube_mesh = new THREE.Mesh( geometry, material );
    cube_mesh.position.copy(pos);
    const cube = {
        mesh: cube_mesh,
        pos: cube_mesh.position,
        prevPos: cube_mesh.position.clone(),
        accel: gravity.clone(),
        isMoving: isMoving
    };
    particles.push(cube);
    return cube;
}

function create_spring(b1, b2){
    const initLength = b1.pos.distanceTo(b2.pos);
    const spring = {
        initLength: initLength,
        b1: b1,
        b2: b2,
        spConstant: spConstant,
        dampingCoefficient: dampingCoefficient
    };
    springs.push(spring);
}

function springLengthNeeded(width,length) {
    const perimeter = width*2 + length*2;
    if (perimeter <= 1000) {
        return 10;
    }
    return Math.round(perimeter / 200);
}

function apply_verlet(pos, prevPos, a, dt) {
    let changeDueToAcceleration = a.clone().multiplyScalar(dt **2);
    let delta = pos.clone().sub(prevPos);
    pos.add(changeDueToAcceleration).add(delta);
    prevPos.add(delta);
}

function apply_constraint(planePos, pos, prevPos) {
    if (pos.y - radius <= planePos.y){
        let temp = pos.y;
        let ogVel = temp - prevPos.y;

        pos.y = planePos.y + radius;
        prevPos.y = pos.y + ogVel*restitution ;
    }
}

function apply_spring(spring) {  
    let currLength = spring.b2.pos.distanceTo(spring.b1.pos);
    if (currLength < 0.01){
        return;
    }
    let delta = currLength - spring.initLength;
    let dir = spring.b2.pos.clone().sub(spring.b1.pos).normalize();
    let spForce= spring.spConstant * delta;

    let v1 = spring.b1.pos.clone().sub(spring.b1.prevPos);
    let v2 = spring.b2.pos.clone().sub(spring.b2.prevPos);
    let factor = v2.clone().sub(v1).dot(dir);
    let dampingForce = spring.dampingCoefficient * factor / dt;

    let totalForce = spring.spConstant * delta + dampingForce;

    spring.b1.accel.add(dir.clone().multiplyScalar(totalForce));
    spring.b2.accel.sub(dir.clone().multiplyScalar(totalForce));
}

function apply_collisions(particles) {
    for(let i = 0; i < particles.length - 1; i++){
        for(let j = i + 1; j < particles.length; j++){
            let collision_axis = particles[j].pos.clone().sub(particles[i].pos);
            let dist = collision_axis.length();
            if (dist < 0.01) {
                continue;
            }
            if (dist < 2 * radius) {
                let delta = 2 * radius - dist;
                const normal = collision_axis.clone().divideScalar(dist);

                particles[i].pos.sub(normal.clone().multiplyScalar(delta / 2));
                particles[j].pos.add(normal.clone().multiplyScalar(delta / 2));

                let v1 = particles[i].pos.clone().sub(particles[i].prevPos);
                let v2 = particles[j].pos.clone().sub(particles[j].prevPos);

                let v1n = normal.clone().multiplyScalar(v1.dot(normal));
                let v2n = normal.clone().multiplyScalar(v2.dot(normal));

                particles[i].prevPos = particles[i].pos.clone().sub(
                    v1.sub(v1n).add(v2n.clone().multiplyScalar(restitution))
                );
                particles[j].prevPos = particles[j].pos.clone().sub(
                    v2.sub(v2n).add(v1n.clone().multiplyScalar(restitution))
                );
            }
        }
    }
}


function create_cloth(startPos, width, length, spLength) {
    let positions = [];
    let map_particles = new Map();

    const step = spLength + 2 * radius;
    const numCols = Math.floor(width / step);
    const numRows = Math.floor(length / step);
    let rowIndex = 0;
    for(let y = startPos.y; y > startPos.y - length; y -= spLength + 2*radius) {
        let row = [];
        let colIndex = 0;
        for(let x = startPos.x; x < startPos.x + width; x+= spLength + 2*radius) {
            const key = `${x},${y}`;
            row.push(key);
            let isMoving = true;
            if ((colIndex === 0 || colIndex === numCols) && (rowIndex === 0 || rowIndex === numRows) ) {
                isMoving = false;
            }
            colIndex++;
            map_particles.set(key, create_particle(new THREE.Vector3(y,0,x), isMoving));
        }
        rowIndex++;
        positions.push(row);
    }
    for(let i = 0; i < positions.length; i++){
        for(let j = 0; j < positions[i].length - 1; j++){
            create_spring(map_particles.get(positions[i][j]), map_particles.get(positions[i][j+1]));
        }
    }
    
    for(let i = 0; i < positions.length -1; i++){
        for(let j = 0; j < positions[i].length; j++){
            create_spring(map_particles.get(positions[i][j]), map_particles.get(positions[i+1][j]));
        }
    }

    for(let i = 0; i < positions.lengt - 1; i++){
        for(let j = 0; j < positions[i].length - 1; j++){
            create_spring(map_particles.get(positions[i][j]), map_particles.get(positions[i+1][j+1]));
        }
    }
    
    for(let i = 1; i < positions.length; i++){
        for(let j = 0; j < positions[i].length-1; j++){
            create_spring(map_particles.get(positions[i][j]), map_particles.get(positions[i-1][j+1]));
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
        side: THREE.DoubleSide ,
        wireframe: false
    });
    const cloth = new THREE.Mesh(geometry, material);
    cloth.castShadow = true;
    cloth.geometry.computeBoundingBox();
    scene.add(cloth);
    return cloth;
}


function animate() {
    for (let s = 0; s < SUBSTEPS; s++) {
        particles.forEach(cube => { cube.accel = gravity.clone(); });
        springs.forEach(spring => apply_spring(spring, subDt));
        particles.forEach(cube => {
            if (cube.isMoving) {
                apply_verlet(cube.pos, cube.prevPos, cube.accel, subDt);
                apply_constraint(plane.position, cube.pos, cube.prevPos);
            }
        });
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

// Adding the plane and cloth to the scene
const cloth = create_cloth(new THREE.Vector3(0,250,0), 100,100, springLengthNeeded(500,500));
const planeGeometry = new THREE.PlaneGeometry(5000,5000);
const planeMaterial = new THREE.MeshStandardMaterial( {color: 0x808080, side: THREE.DoubleSide});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.receiveShadow = true;
scene.add(plane);
plane.position.set(0,-100,0);
plane.rotation.x = Math.PI / 2;
const center = new THREE.Vector3();
cloth.geometry.boundingBox.getCenter(center);

// Aligning camera's initial position
camera.position.y -= 20;
camera.lookAt(center);
controls.target.copy(center);

const toCenter = new THREE.Vector3();
toCenter.subVectors(center, camera.position).normalize();

const distanceToCenter = camera.position.distanceTo(center);
camera.position.add(toCenter.multiplyScalar(distanceToCenter / 2));

controls.update();

