import { max } from "three/tsl";
import { calculateNoise, lerp} from "./functions";
import * as THREE from 'three';

let width, length;

function Particle(pos){  // Particle prototype
    this.pos = pos; 
    this.dir = new THREE.Vector2(0,0);
    this.vel = 1;
    this.water = 1.0;
    this.sediment = 0;
    this.capacity = 10;
    this.inBound = true;
}

function computePositionalValues(x,y, points) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;

    const tl = points[(yi*width + xi)*3 + 2];
    const tr = points[(yi*width + xi + 1)*3 + 2];
    const bl = points[((yi+1)*width + xi)*3 + 2];
    const br = points[((yi+1)*width + xi + 1)*3 + 2];

    return {xi, yi, xf, yf, tl, tr, bl, br};
}

function computeHeight(posValues){
    const top = lerp(posValues.tl, posValues.tr, posValues.xf);
    const bottom = lerp(posValues.bl, posValues.br, posValues.xf);
    
    return lerp(top, bottom, posValues.yf);
}

export function createRandomParticles(points, amount, w, l){
    width = w;
    length = l;
    const particles = [];
    
    for(let i = 0; i < amount; i++){
        const x = Math.random()*width;
        const y = Math.random()*length;
        particles.push(new Particle(new THREE.Vector2(x,y)));
    }
    console.log(particles);
    return particles;
}

function computeGradient(posValues, maxHeight){
    const u = posValues.xf;
    const v = posValues.yf;

    const tl = posValues.tl / maxHeight;
    const tr = posValues.tr / maxHeight;
    const bl = posValues.bl / maxHeight;
    const br = posValues.br / maxHeight;

    return new THREE.Vector2((tr - tl)*(1-v) + (br - bl)*v, (bl - tl)*(1-u) + (br - tr)*u);    
}

function deposit(posValues, points, sediment, param){ // return the amount of sediment used
    const topHeight = Math.max(posValues.tl, posValues.tr, posValues.bl, posValues.br);
    const totalW = posValues.tl + posValues.tr + posValues.bl + posValues.br;
    const sedimentNeededToFill = topHeight*4 - totalW;
    if (sedimentNeededToFill <= sediment) {
        points[(posValues.yi * width + posValues.xi)*3 + 2]               = topHeight;
        points[(posValues.yi * width + posValues.xi + 1)*3 + 2]           = topHeight;
        points[((posValues.yi + 1) * width + posValues.xi)*3 + 2]         = topHeight;
        points[((posValues.yi + 1) * width + posValues.xi + 1)*3 + 2]     = topHeight;
        return sedimentNeededToFill;
    }
    const u = posValues.xf;
    const v = posValues.yf;
    const wtl = (1 - u) * (1 - v);
    const wtr = u * (1 - v);
    const wbl = (1 - u) * v;
    const wbr = u * v;

    points[(posValues.yi * width + posValues.xi)*3 + 2]               += sediment * wtl;
    points[(posValues.yi * width + posValues.xi + 1)*3 + 2]           += sediment * wtr;
    points[((posValues.yi + 1) * width + posValues.xi)*3 + 2]         += sediment * wbl;
    points[((posValues.yi + 1) * width + posValues.xi + 1)*3 + 2]     += sediment * wbr;
    return sediment;
}

function pointsInRadius(pos, radius){
    const result = [];
    let initialX = pos.x;
    let initialY = pos.y;
    outerLoop: for (let yDisplacement = -radius; yDisplacement <= radius; yDisplacement++) {
        for (let xDisplacement = -radius; xDisplacement <= radius; xDisplacement++) {
            const currX = Math.floor(pos.x + xDisplacement);
            const currY = Math.floor(pos.y + yDisplacement);
            if (currX < 0 || currY < 0){
                continue;
            }
            else if (currX >= width) {
                break;
            }
            else if (currY >= length) {
                break outerLoop;
            }

            const distance = Math.sqrt((currX - initialX) ** 2 + (currY - initialY) ** 2);
            const point = {
                x: currX, 
                y: currY
            }
            if (distance <= radius) { result.push(point) } 
        }
    }
    return result;
}

function erode(pos, points, sediment, param){ // return the amount o sediment removed
    const nearbyPoints = pointsInRadius(pos, param.radius);
    let totalW = 0;
    let removedSediment = 0
    nearbyPoints.forEach((point,i) => {
        const distance = Math.sqrt((point.x - pos.x)** 2 + (point.y - pos.y)** 2);
        totalW += Math.max(0, param.radius - distance);
    });

    const wValues = [];
    nearbyPoints.forEach((point,i) => {
        const distance = Math.sqrt((point.x - pos.x)** 2 + (point.y - pos.y)** 2);
        wValues.push(Math.max(0, param.radius - distance)/totalW);
    });
    nearbyPoints.forEach((point,i) => {
        if (points[(point.y * width + point.x) * 3 + 2] > param.maxHeight / 10){
            points[(point.y * width + point.x) * 3 + 2] -= sediment * wValues[i];
            removedSediment += sediment * wValues[i];
        }
    });

    return removedSediment;

}

export function update(particle, points, param){
    if (particle.pos.x > width -1 || particle.pos.y > length - 1 || particle.pos.x < 1 || particle.pos.y < 1) {
        return;
    }
    const posValues = computePositionalValues(particle.pos.x, particle.pos.y, points);
    const gradient = computeGradient(posValues, param.maxHeight);
    const dirNew = new THREE.Vector2();
    const currHeight = computeHeight(posValues);
    dirNew.subVectors(particle.dir.clone().multiplyScalar(param.inertia), gradient.clone().multiplyScalar(1-param.inertia));
    if (dirNew.length() == 0) {
        dirNew.set(Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    }
    else{
        dirNew.normalize();
    }

    const posNew = new THREE.Vector2();

    posNew.addVectors(particle.pos, dirNew);

    if (posNew.x < 0 || posNew.x >= width - 1 || posNew.y < 0 || posNew.y >= length - 1) {
        particle.pos = posNew;
        return;
    }

    const newPosValues = computePositionalValues(posNew.x, posNew.y, points);
    const heightNew = computeHeight(newPosValues);
    const hDiff = heightNew - currHeight;
    if (hDiff > 0) {
        const sedimentDropped = Math.min(hDiff, particle.sediment);
        particle.sediment -= deposit(posValues, points, sedimentDropped, param);
    }
    else{
        particle.capacity = Math.max(-hDiff,param.minSlope) * particle.vel * particle.water * param.capacity;
        if (particle.sediment > particle.capacity){
            const sedimentDropped = (particle.sediment - particle.capacity) * param.desposition;
            particle.sediment -= deposit(posValues, points, sedimentDropped, param);
        }
        else{
            const sedimentTaken = Math.min(-hDiff, (particle.capacity - particle.sediment) * param.erosion);
            particle.sediment += erode(particle.pos, points, sedimentTaken, param);

        }

    }
    particle.dir = dirNew.clone();
    particle.pos = posNew.clone();
    particle.vel = Math.sqrt((Math.max(0, particle.vel ** 2 - hDiff * param.gravity)));
    particle.water = particle.water * (1 - param.evaporation);
}