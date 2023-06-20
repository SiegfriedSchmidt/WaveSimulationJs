const PI = 3.14159265359;

struct Block {
    height: f32,
    vel: f32,
    mass: f32,
}

@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(2) var<uniform> fieldRes: vec2u;
@group(0) @binding(3) var<storage> fieldStateIn: array<Block>;
@group(0) @binding(4) var<storage, read_write> fieldStateOut: array<Block>;


fn hash(state: f32) -> f32 {
    var s = u32(state);
    s ^= 2747636419;
    s *= 2654435769;
    s ^= s >> 16;
    s *= 2654435769;
    s ^= s >> 16;
    s *= 2654435769;
    return f32(s) / 4294967295;
}

fn getPos(pos: vec2u) -> u32 {
    return u32(pos.x + pos.y * u32(fieldRes.x));
}

fn checkBorder(x: i32, y: i32) -> bool {
    return (x < 0 || x >= i32(fieldRes.x) || y < 0 || y >= i32(fieldRes.y));
}

fn getVal(x: u32, y: u32) -> f32 {
    if (checkBorder(i32(x), i32(y))) {
        return 0;
    }
    return fieldStateIn[getPos(vec2u(x, y))].height;
}

fn lerp(start: f32, end: f32, t: f32) -> f32 {
    return start * (1 - t) + end * t;
}

@compute @workgroup_size(8, 8)
fn processField(@builtin(global_invocation_id) cell: vec3u) {
    if (checkBorder(i32(cell.x), i32(cell.y))) {
        return;
    }

    let sum = getVal(cell.x + 1, cell.y + 1) +
              getVal(cell.x + 1, cell.y) +
              getVal(cell.x + 1, cell.y - 1) +
              getVal(cell.x, cell.y - 1) +
              getVal(cell.x - 1, cell.y - 1) +
              getVal(cell.x - 1, cell.y) +
              getVal(cell.x - 1, cell.y + 1) +
              getVal(cell.x, cell.y + 1);

    let pos = getPos(cell.xy);
    fieldStateOut[pos].height += fieldStateIn[pos].vel;
    fieldStateOut[pos].vel += (sum / 8 - fieldStateIn[pos].height) * fieldStateIn[pos].mass;
}

@compute @workgroup_size(8, 8)
fn updateField(@builtin(global_invocation_id) cell: vec3u) {
    if (checkBorder(i32(cell.x), i32(cell.y))) {
        return;
    }
    let pos = getPos(cell.xy);
    if (cell.x == fieldRes.x / 2 - 250 && cell.y == fieldRes.y / 2) {
        fieldStateOut[pos].height = (sin(2 * PI * time / 50)) * 10;
    } else if (cell.x == fieldRes.x / 2 + 250 && cell.y == fieldRes.y / 2) {
        fieldStateOut[pos].height = (sin(2 * PI * time / 50)) * 10;
    }
}
