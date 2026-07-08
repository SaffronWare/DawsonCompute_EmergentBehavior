import {calculateNoise,lerp, calculateRange} from './functions.js';
import * as THREE from 'three';
import GUI from 'lil-gui';
import Buffer from 'three/src/renderers/common/Buffer.js';
import {createRandomParticles, update} from './particle.js'
import { ThreeMFLoader } from 'three/examples/jsm/Addons.js';

// Setting up the scene
const gui = new GUI;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();

const clock = new THREE.Clock();
let step = 100;
let time = 0;

const mainDistribution = [[0,0],[0.1,0],[0.2,0.01],[0.3,0.04],[0.4,0.45],[0.5,0.35],[0.55,0.05],[0.6,0.09], [0.7,0.01],[0.8,0],[0.9,0]];

const terrainParam={
    width: 250,
    height: 250,
    maxHeight: 200,
    capacity: 8,
    radius: 6,
    inertia: 0.2,
    desposition: 0.1,
    erosion: 0.1,
    gravity: 10,
    evaporation: 0.05,
    minSlope: 0.1
};

const noiseParam= {
    displacementX: 0,
    displacementY: 0,
    octave: 8,
    freq: 0.5,
    zoom: 50,
    repeat: 256
}

const noise2Param = {
    displacementX: 100,
    displacementY: 100,
    octave: 8,
    freq: 0.5,
    zoom: 50,
    repeat: 256
}

const biomeParam = {
    water: 0.4,
    land: 0.5
}

let hiddenbiomeParam = calculateRange(biomeParam.water, biomeParam.land, mainDistribution);

renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setSize(640, 480, false);
document.body.appendChild(renderer.domElement);

// Procedural Generation Functions
function assignColour(x,y){
    const water = hiddenbiomeParam.water;
    const land = hiddenbiomeParam.land;
    const heightNoise = calculateNoise(x,y, noiseParam.displacementX, noiseParam.displacementY, noiseParam.octave, noiseParam.freq, noiseParam.zoom, noiseParam.repeat);
    const colourNoise = calculateNoise(x,y, noise2Param.displacementX, noise2Param.displacementY, noise2Param.octave, noise2Param.freq, noise2Param.zoom, noise2Param.repeat);
    let colour = [0,0,0];
    if (heightNoise < water) {
        let gradient = heightNoise / water;
        colour[2] = Math.round(255* gradient);
    }
    else if (heightNoise < land) {
        if (colourNoise < 0.55) {
            let gradient = (colourNoise + heightNoise - water) / (0.55 + land - water);
            colour[0] = lerp(120, 101, gradient);
            colour[1] = lerp(100, 67, gradient);
            colour[2] = lerp(75, 33, gradient);
        }
        else{
            let gradient = (colourNoise - 0.55 + heightNoise - water) / (1 - 0.55 + land - water);
            colour[0] = lerp(170,250, gradient);
            colour[1] = lerp(180,210, gradient);
            colour[2] = 130;
        }
    }
    else{
        if (colourNoise < 0.45) {
            let gradient = (colourNoise + heightNoise - land) / (0.45 + 0.8 - land);
            colour[0] = lerp(180,90, gradient);
            colour[1] = lerp(180,90, gradient);
            colour[2] = lerp(180,90, gradient);
        }
        else{
            let gradient = (colourNoise - 0.45 + heightNoise - land) / (1 - 0.45 + 0.8 - land);
            colour[0] = lerp(90,20, gradient);
            colour[1] = lerp(90,20, gradient);
            colour[2] = lerp(90,20, gradient);
        }
    }
    return colour;
}

function createNoise(){
    const data = [];
    const width = terrainParam.width;
    const height = terrainParam.height;
    for (let y = 0; y < height; y++) {
            for(let x = 0; x < width; x++) {
                let noise = calculateNoise(x,y, noiseParam.displacementX, noiseParam.displacementY, noiseParam.octave, noiseParam.freq, noiseParam.zoom, noiseParam.repeat);
                if (noise <= hiddenbiomeParam.water){
                    data.push({x: x - width / 2,   
                        y: y - height / 2,  
                        z: hiddenbiomeParam.water * terrainParam.maxHeight});
                }
                else{
                    data.push({x: x - width / 2,  
                        y: y - height / 2,  
                        z: noise * terrainParam.maxHeight});
                    }
            }
    }
    return data;
}

function createGeometry() {
    const data = createNoise();
    const posArray = new Float32Array(data.length * 3);
    data.forEach((v, i) => {
        posArray[i * 3] = v.x;
        posArray[i * 3 + 1] = v.y;
        posArray[i * 3 + 2] = v.z;
    });
    const height = terrainParam.height;
    const width = terrainParam.width;
    const indexArray = [];
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const a = y * width + x;
            const b = y * width + (x + 1);
            const c = (y + 1) * width + x;
            const d = (y + 1) * width + (x + 1);
            indexArray.push(a, b, c);
            indexArray.push(b, d, c);
        }
    }

    const colourArray = new Float32Array(data.length * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const colour = assignColour(x,y);
            const i = (y * width + x) * 3;
            colourArray[i] = colour[0] / 255;
            colourArray[i + 1] = colour[1] / 255;
            colourArray[i + 2] = colour[2] / 255;
        }
    }

    const posAttr = new THREE.BufferAttribute(posArray, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage); 

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('color', new THREE.BufferAttribute(colourArray, 3));
    geometry.setIndex(indexArray);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
}

let particles = [];

// Erosion Functions
function runErosion(plane) {
    const points = plane.geometry.getAttribute('position');
    particles = createRandomParticles(points.array, 50000, terrainParam.width, terrainParam.height);

    points.needsUpdate = true;
    plane.geometry.computeVertexNormals();
    plane.geometry.computeBoundingBox();
    plane.geometry.computeBoundingSphere();
    return particles;
}

function erosionStep(plane) {
    const points = plane.geometry.getAttribute('position');
    particles.forEach((particle) => {
        update(particle, points.array, terrainParam);
        });
    points.needsUpdate = true;
}

function erosionAnimate(plane){
    if (step > 0) {
        erosionStep(plane);
    }
    else{
        clock.stop();
    }
    step--;
}

function resetPlane(plane) {
    plane.geometry.dispose();
    plane.geometry = createGeometry();
    step = 100;
    time = 0;
    runErosion(plane);
}

// Setting up plane
const plane = new THREE.Mesh(
    createGeometry(),
    new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    })
);
runErosion(plane);

// Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xFFDF22, 189010);
pointLight.position.set(100, 660, 90);  
scene.add(pointLight);

plane.rotation.x = -Math.PI / 2; 
scene.add(plane);

const center = new THREE.Vector3();
plane.geometry.boundingBox.getCenter(center);

camera.position.set(0, 360, 210);
camera.lookAt(0,0,0);

// GUI
const erosionFolder = gui.addFolder('Erosion');
erosionFolder.add(terrainParam, 'capacity', 2, 32,1);
erosionFolder.add(terrainParam, 'radius', 1, 10,1);
erosionFolder.add(terrainParam, 'inertia', 0, 1, 0.005);
erosionFolder.add(terrainParam, 'desposition', 0, 1, 0.005);
erosionFolder.add(terrainParam, 'erosion', 0, 1, 0.005);
erosionFolder.add(terrainParam, 'gravity', 1, 50, 1);
erosionFolder.add(terrainParam, 'evaporation', 0, 0.5, 0.005);
erosionFolder.add(terrainParam, 'minSlope', 0, 1, 0.005);

erosionFolder.add({'Reset Plane': () => {
    resetPlane(plane);
}}, 'Reset Plane');
erosionFolder.add({'Play Erosion': () => {
    erosionAnimate(plane);
    clock.start();
}}, 'Play Erosion');

const terrainFolder = gui.addFolder('Terrain');
terrainFolder.add(terrainParam, 'width', 50,500,50);
terrainFolder.add(terrainParam, 'height', 50,500,50);
terrainFolder.add(terrainParam, 'maxHeight', 50, 1000, 50);
terrainFolder.onFinishChange(event => {
    plane.geometry.dispose();
    plane.geometry = createGeometry();
});

const biomeFolder = terrainFolder.addFolder('Biome Portion');
biomeFolder.add(biomeParam, 'water', 0, 1, 0.01);
biomeFolder.add(biomeParam, 'land', 0, 1, 0.01); 
biomeFolder.onFinishChange((event => {
    hiddenbiomeParam = calculateRange(biomeParam.water, biomeParam.land, mainDistribution);
    resetPlane(plane);
}));

const noiseFolder = terrainFolder.addFolder('Height Noise');
noiseFolder.add(noiseParam, 'displacementX', 0, 1000, 50);
noiseFolder.add(noiseParam, 'displacementY', 0, 1000, 50);
noiseFolder.add(noiseParam, 'octave', 1, 10, 1);
noiseFolder.add(noiseParam, 'freq', 0.1, 1, 0.05);
noiseFolder.add(noiseParam, 'zoom', 10,200, 10);
noiseFolder.add(noiseParam, 'repeat', 1, 256, 1);
noiseFolder.onFinishChange((event => {
    resetPlane(plane);
}));

const colourNoiseFolder = terrainFolder.addFolder('Colour Noise');
colourNoiseFolder.add(noise2Param, 'displacementX', 0, 1000, 50);
colourNoiseFolder.add(noise2Param, 'displacementY', 0, 1000, 50);
colourNoiseFolder.add(noise2Param, 'octave', 1, 10, 1);
colourNoiseFolder.add(noise2Param, 'freq', 0.1, 1, 0.05);
colourNoiseFolder.add(noise2Param, 'zoom', 10,200, 10);
colourNoiseFolder.add(noise2Param, 'repeat', 1, 256, 1);
colourNoiseFolder.onFinishChange((event => {
    resetPlane(plane);
}));

const lightFolder = gui.addFolder('Light');
lightFolder.add(pointLight.position, 'x', -10, 10, 0.5);
lightFolder.add(pointLight.position, 'y', -1000, 1000, 10);
lightFolder.add(pointLight.position, 'z', -1000, 1000, 10);
lightFolder.add(pointLight, 'intensity', 10, 1000000, 1000);


const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(camera.position, 'x', -10, 10, 0.5);
cameraFolder.add(camera.position, 'y', -250, 1200, 50);
cameraFolder.add(camera.position, 'z', -250, 1200, 50);
cameraFolder.onFinishChange(event => camera.lookAt(0,0,0));

function animate() {
    requestAnimationFrame(animate);
    if (clock.running){
        time += clock.getDelta();
        if (time >= 0.1) {
            time = 0;
            erosionAnimate(plane);
        }
    }
    else {
        plane.rotation.z += Math.PI/1440;
    }
    renderer.render(scene, camera);
}
animate();


