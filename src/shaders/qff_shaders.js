export const qffVertShader = `
precision highp float;
varying vec3 vOrigin;
varying vec3 vDirection;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vOrigin = cameraPosition;
    vec3 pp = vec3((modelMatrix * vec4(position, 1.0)).xyz);
    vDirection = pp - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
}
`

export const qffFragShader = `
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2D;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform sampler3D[5] grid_textures;

uniform sampler3D[8] qff_textures;
uniform float grid_th;
uniform int grid_mips;

uniform mat4[32] density_weight_0;
uniform mat4[32] rgb_weight_0;
uniform mat4[4] rgb_weight_1;

uniform float[4] freqs;

uniform int num_freqs;
uniform int num_quants;
uniform int grid_res;
uniform float render_step;
uniform float min_alpha;

const int MAX_ITERS = 128;
const int MAX_NUM_FREQS = 4;
const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

const float ITSPI = 1.0 / (2.0 * 1.77245385);
const float S2 = 1.41421356;
const float S3 = 1.73205081;
const float S5 = 2.23606798;
const float S7 = 2.64575131;
const float S15 = S3*S5;
const float S42 = S2*S3*S7;
const float S70 = S2*S5*S7;
const float S105 = S15 * S7;


varying vec3 vOrigin;
varying vec3 vDirection;
vec4 z = vec4(0.0, 0.0, 0.0, 0.0);

vec2 hitBox( vec3 orig, vec3 dir ) {
    const vec3 box_min = vec3(0.0);
    const vec3 box_max = vec3( 1.0 );
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
    vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
    vec3 tmin = min( tmin_tmp, tmax_tmp );
    vec3 tmax = max( tmin_tmp, tmax_tmp );
    float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
    float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
    return vec2( t0, t1 );
}

vec4[4] density_layer_0(vec4[8] qff_values){
    vec4[4] out_vecs = vec4[4] (z, z, z, z);

    for( int fid = 0; fid < num_freqs * 2; fid++){
        for (int oid = 0; oid < 4; oid++){
            out_vecs[oid] += density_weight_0[fid * 4 + oid] * qff_values[fid];
        }
    }
    return out_vecs;
}

vec4[4] rgb_layer_0(vec4[4] color_input){
    vec4[4] out_vecs = vec4[4] (z, z, z, z);

    for (int oid = 0; oid < 4; oid++){
        for( int iid = 0; iid < 4; iid++){
            out_vecs[oid] += rgb_weight_0[iid * 4 + oid] * color_input[iid];
        }
    }
    return out_vecs;
}

vec3 rgb_layer_1(vec4[4] color_val, vec4[4] sh_feats){
    // relu
    for (int oid = 0; oid < 4; oid++){
        color_val[oid] = max(color_val[oid] + sh_feats[oid], 0.0);
    }
    vec4 out_vec = vec4(0.0, 0.0, 0.0, 0.0);

    for (int iid = 0; iid < 4; iid++){
        out_vec += rgb_weight_1[iid] * color_val[iid];
    }
    return out_vec.rgb;
}

vec4[4] compute_sh_feats(vec3 dir){
    float xx = dir.x * dir.x;
    float yy = dir.y * dir.y;
    float zz = dir.z * dir.z;
    float xy = dir.x * dir.y;
    float yz = dir.y * dir.z;
    float zx = dir.z * dir.x;
    float dx = dir.x;
    float dy = dir.y;
    float dz = dir.z;

    vec4[4] shf = vec4[4](z, z, z, z);
    vec4[4] ret = vec4[4](z, z, z, z);
    vec4 d0v = vec4(1.0, -S3, S3, -S3) * ITSPI;
    vec4 d1v = vec4(S15, -S15, S5  / 2.0, -S15) * ITSPI;
    vec4 d2v = vec4(S15 / 2.0, S70/ 4.0, S105, S42 / 4.0) * ITSPI;
    vec4 d3v = vec4(S7 / 2.0, S42 / 4.0, S105 / 2.0, S70 / 4.0) * ITSPI;

    shf[0] = d0v * vec4(1.0, dir.yzx);
    shf[1] = d1v * vec4(xy, yz, 3.0 * zz - 1.0, zx);
    shf[2] = d2v * vec4(xx - yy, dy * (-3.0 * xx + yy), xy * dz, dy * (1.0 - 5.0 * zz));
    shf[3] = d3v * vec4(dz * (5.0 * zz - 3.0), dx * (1.0 - 5.0 * zz), dz * (xx - yy), dx * (-xx + 3.0*yy));

    // apply first MLP layer for precomputing SH features
    for (int oid = 0; oid < 4; oid++){
        for( int iid = 0; iid < 4; iid++){
            ret[oid] += rgb_weight_0[(iid + 4) * 4 + oid] * shf[iid];
        }
    }
    return ret;
}
int mip_from_pos(vec3 p){
    vec3 np = p - 0.5;
    vec3 ap = abs(np);
    int mip = int(-log2(max(max(ap.x, ap.y), ap.z)));
    return max(min(mip - 1, grid_mips - 1), 0);
}

float sample_grid( vec3 p ) {
    int mip = mip_from_pos(p);
    vec3 sp = (p - 0.5) * exp2(float(mip)) + 0.5;
    switch(mip){
        case 0:
            return texture(grid_textures[0], sp).r;
        case 1:
            return texture(grid_textures[1], sp).r;
        case 2:
            return texture(grid_textures[2], sp).r;
        case 3:
            return texture(grid_textures[3], sp).r;
        case 4:
            return texture(grid_textures[4], sp).r;
    }
}
vec3 sigmoid(vec3 v){
    return 1.0 / (1.0 + exp(-v));
}

vec4 query( vec3 p, vec3 dir, float t, vec4[4] sh_feats, float dt) {
    vec4 feats[8] = vec4[8](z, z, z, z, z, z, z, z);

    for (int fid = 0; fid < num_freqs; fid++){
        float f = freqs[fid] * PI;
        vec3 sp = (sin(mod(f * (p - 0.5), TWO_PI)) * float(num_quants - 1) / float(num_quants)) / 2.0 + 0.50;
        vec3 cp = (cos(mod(f * (p - 0.5), TWO_PI)) * float(num_quants - 1) / float(num_quants)) / 2.0 + 0.50;

        switch(fid){
            case 0:
                feats[0] = texture(qff_textures[0], sp);
                feats[1] = texture(qff_textures[1], cp);
                break;
            case 1:
                feats[2] = texture(qff_textures[2], sp);
                feats[3] = texture(qff_textures[3], cp);
                break;
            case 2:
                feats[4] = texture(qff_textures[4], sp);
                feats[5] = texture(qff_textures[5], cp);
                break;
            case 3:
                feats[6] = texture(qff_textures[6], sp);
                feats[7] = texture(qff_textures[7], cp);
                break;
        }
    }


    // obtain density features
    vec4[4] density_feats_0 = density_layer_0(feats);

    float density = min(density_feats_0[0].r,11.0);
    density = exp(density);
    float alpha = 1.0 - exp(-density * dt);

    // at this point, we have high alpha
    // if we want to just render depth, return early

    // 
    vec4[4] color_input = vec4[4](
        density_feats_0[0], 
        density_feats_0[1], 
        density_feats_0[2], 
        density_feats_0[3]
    );
    vec4[4] rgb_feats_0 = rgb_layer_0(color_input);
    vec3 rgb = rgb_layer_1(rgb_feats_0, sh_feats);

    rgb = sigmoid(rgb);

    return vec4(rgb, alpha);
}
void main(){
    vec3 rayDir = normalize( vDirection );
    vec2 bounds = hitBox( vOrigin, rayDir );

    if ( bounds.x > bounds.y ) {
        discard;
    }
    vec4 [4] sh_feats = compute_sh_feats(rayDir);
    
    bounds.x = max( bounds.x, 0.0 );
    vec3 p = vOrigin + bounds.x * rayDir;
    vec3 inc = 1.0 / abs( rayDir );

    float grid_step_size = render_step * min(float(grid_mips), 4.0);
    float non_grid_step_size = render_step;

    vec3 rgb = vec3(0.0, 0.0, 0.0);
    float acc_trans = 1.0;
    float t = bounds.x;
    float iter_count = 0.0;
    float max_it = float(MAX_ITERS);
    while(t < bounds.y && iter_count < max_it){
        p = vOrigin + rayDir * t;
        int mip = mip_from_pos(p);
        // float scale = max(1.0 / exp2(float(mip)), 0.125);
        float scale = 1.0 / exp2(float(mip));
        float grid = sample_grid(p);
        if (grid < grid_th){
            t = t + grid_step_size * scale;
            continue;
        // } else {
        //     gl_FragColor = vec4(0.0, t - 0.3, 0.0, 1.0);
        //     return;
        }
        
        // at this point, we have hit something in grid.
        vec4 rgba = query(p, rayDir, t, sh_feats, non_grid_step_size);
        float alpha = rgba.a;
        float weight = alpha * acc_trans;
        rgb += weight * rgba.rgb;
        acc_trans *= (1.0 - alpha);

        if (acc_trans < 0.01) {
            break;
        }
        t = t + non_grid_step_size * scale;
        iter_count += 1.0 * scale;
    }

    gl_FragColor = vec4(rgb, 1.0 - acc_trans);
}
`
