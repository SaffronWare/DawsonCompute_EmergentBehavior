const permutations = [151,160,137,91,90,15,                
    131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,  
    190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,
    88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,
    77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,
    102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,196,
    135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,
    5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
    223,183,170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,
    129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,97,228,
    251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,
    49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
    ];

const p = [];
for(let i = 0; i < 512; i++){
    p.push(permutations[i % 256])
}

const vectors = [[1,0],[0,1],[-1,0],[0,-1]];


function fade(t){
    return 6* (t**5) - 15* (t**4) + 10* (t**3);
}

function hash(xi, yi){
    return p[p[xi] + yi];
}

function grad(hash, xf, yf){
    let i = hash & 3;
    return xf * vectors[i][0] + yf * vectors[i][1];
}

function inc(a, repeat) {
    if (repeat > 0){
        return (a+1) % repeat;
    }
    return a + 1;
}

export function lerp(a,b, weight) {
    return a + weight*(b - a);
}

function perlin(x,y, repeat) {
    if (repeat > 0) {
        x = x % repeat
        y = y % repeat
    }    
    let xi = Math.floor(x) & 255;
    let yi = Math.floor(y) & 255;
    let xf = x - Math.floor(x);
    let yf = y - Math.floor(y);
    let u = fade(xf);
    let v = fade(yf);

    let aa = hash(xi,yi);
    let ab = hash(xi, inc(yi, repeat));
    let ba = hash(inc(xi, repeat), yi);
    let bb = hash(inc(xi, repeat), inc(yi, repeat));

    let x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    let x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

    return (lerp(x1, x2, v)+1)/2;
}

function octavePerlin(x, y, oct, pst, repeat) {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let maxValue = 0;
    for(let i = 0; i < oct; i++){
        total += perlin(x*freq, y*freq, repeat) * amp;
        maxValue += amp;
        amp *= pst;
        freq *= 2;
    }
    return total/maxValue;
}

export function calculateNoise(x,y, displacementX, displacementY, octave, freq, zoom, repeat) { // given some parameters and a 2d position, generate a number between 0-1 using perlin noise
    return octavePerlin((x + displacementX)/zoom,  (y + displacementY) / zoom, octave, freq, repeat);
}

function nr(a,b){ // normalized ratio, return 1 if a >= b, a/b if a < b
    if (a >= b) {
        return 1;
    }
    return a / b;
}

export function translatePortion(portion, distribution){ // with a normal portion 0 - 1, translate it to a special portion according to main distribution
    let remaining = portion;
    let index = 0;
    let ratio = 0;

    if (remaining <= 0) {
        return 0;
    }
    while (remaining > 0){
        ratio = nr(remaining, distribution[index][1]);
        remaining -= ratio*distribution[index][1];
        remaining = Math.round(remaining *100) /100;
        index++;
    }
    index--;
    return lerp(distribution[index][0], distribution[index + 1][0], ratio);
}

export function createNewDistribution(initial, old) {
    if (initial <= 0) return old;  
    if (initial >= 1) return [];
    let result = [];
    for(let i = 0; i < old.length - 1; i++) {
        if (old[i][0] > initial){
            result.push(old[i]);
        }
        else if (old[i+1][0] > initial){
            let newWeight = ((old[i+1][0] - initial) / (old[i+1][0] - old[i][0])) * old[i][1];

            result.push([initial,newWeight]);
        }
    }
    result.push(old.at(-1));

    return result;
}

export function calculateRange(waterPortion, landPortion, distribution){ 
    const water = waterPortion;
    const land = (1 - water) * landPortion;
    let dist = distribution;

    let waterRatio = translatePortion(water, dist);
    dist = createNewDistribution(waterRatio, dist);

    let landRatio = translatePortion(land, dist);
    dist = createNewDistribution(landRatio, dist);

    waterRatio = waterRatio || 0;
    landRatio = landRatio || waterRatio;
    
    return {
        water: Math.round(waterRatio* 1000)/ 1000,
        land: Math.round(landRatio * 1000) / 1000
        }
}