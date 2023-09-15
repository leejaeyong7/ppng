precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2D;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform sampler3D grid_texture;

uniform sampler3D[4] qff_sin_textures;
uniform sampler3D[4] qff_cos_textures;
uniform float density_bias;

uniform mat4[32] density_weight_0;
uniform mat4[16] density_weight_1;
uniform mat4[20] rgb_weight_0;
uniform mat4[4] rgb_weight_1;


uniform sampler2D freqs;

uniform int num_freqs;
uniform bool output_mode;
uniform int num_quants;
uniform float render_step;
uniform float min_alpha;

const int MAX_ITERS = 4096;
const int MAX_NUM_FREQS = 4;
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

    // relu
    for (int oid = 0; oid < 4; oid++){
        out_vecs[oid] = max(out_vecs[oid], 0.0);
    }
    return out_vecs;
}

vec4[4] density_layer_1(vec4[4] density_val){
    vec4[4] out_vecs = vec4[4] (z, z, z, z);

    for( int iid = 0; iid < 4; iid++){
        for (int oid = 0; oid < 4; oid++){
            out_vecs[oid] += density_weight_1[iid * 4 + oid] * density_val[iid];
        }
    }
    return out_vecs;
}

vec4[4] rgb_layer_0(vec4[5] color_input){
    vec4[4] out_vecs = vec4[4] (z, z, z, z);

    for (int oid = 0; oid < 4; oid++){
        for( int iid = 0; iid < 5; iid++){
            out_vecs[oid] += rgb_weight_0[iid * 4 + oid] * color_input[iid];
        }
    }
    // relu
    for (int oid = 0; oid < 4; oid++){
        out_vecs[oid] = max(out_vecs[oid], 0.0);
    }
    return out_vecs;
}

vec3 rgb_layer_1(vec4[4] color_val){
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

    vec4[4] ret = vec4[4](z, z, z, z);
    vec4 d0v = vec4(1.0, -S3, S3, -S3) * ITSPI;
    vec4 d1v = vec4(S15, -S15, S5  / 2.0, -S15) * ITSPI;
    vec4 d2v = vec4(S15 / 2.0, S70/ 4.0, S105, S42 / 4.0) * ITSPI;
    vec4 d3v = vec4(S7 / 2.0, S42 / 4.0, S105 / 2.0, S70 / 4.0) * ITSPI;

    ret[0] = d0v * vec4(1.0, dir.yzx);
    ret[1] = d1v * vec4(xy, yz, 3.0 * zz - 1.0, zx);
    ret[2] = d2v * vec4(xx - yy, dy * (-3.0 * xx + yy), xy * dz, dy * (1.0 - 5.0 * zz));
    ret[3] = d3v * vec4(dz * (5.0 * zz - 3.0), dx * (1.0 - 5.0 * zz), dz * (xx - yy), dx * (-xx + 3.0*yy));
    return ret;
}

float sample_grid( vec3 p ) {
    return texture( grid_texture, p ).r;
}
vec3 sigmoid(vec3 v){
    return 1.0 / (1.0 + exp(-v));
}

vec4 query( vec3 p, vec3 dir, float t, float dt, bool output_mode) {
    vec4 feats[8] = vec4[8](z, z, z, z, z, z, z, z);

    for (int fid = 0; fid < num_freqs; fid++){
        float f = texelFetch( freqs, ivec2(fid, 0), 0 ).r;
        vec3 sp = (sin(mod(f * p, TWO_PI)) * float(num_quants - 1) / float(num_quants)) / 2.0 + 0.50;
        vec3 cp = (cos(mod(f * p, TWO_PI)) * float(num_quants - 1) / float(num_quants)) / 2.0 + 0.50;

        switch(fid){
            case 0:
                feats[0] = texture(qff_sin_textures[0], sp);
                feats[1] = texture(qff_cos_textures[0], cp);
                break;
            case 1:
                feats[2] = texture(qff_sin_textures[1], sp);
                feats[3] = texture(qff_cos_textures[1], cp);
                break;
            case 2:
                feats[4] = texture(qff_sin_textures[2], sp);
                feats[5] = texture(qff_cos_textures[2], cp);
                break;
            case 3:
                feats[6] = texture(qff_sin_textures[3], sp);
                feats[7] = texture(qff_cos_textures[3], cp);
                break;
        }
    }


    // obtain density features
    vec4[4] density_feats_0 = density_layer_0(feats);
    vec4[4] density_feats_1 = density_layer_1(density_feats_0);

    float density = min(density_feats_1[0].r + density_bias,11.0);
    density = exp(density);
    float alpha = 1.0 - exp(-density * dt);
    if (alpha < 0.01){
        return vec4(0.0, 0.0, 0.0, alpha);
    }

    // at this point, we have high alpha
    // if we want to just render depth, return early
    if (output_mode){
        return vec4(t * 1.0, t * 1.0, t * 1.0, alpha);
    }

    // 
    vec4[5] color_input = vec4[5](
        density_feats_1[0], 
        density_feats_1[1], 
        density_feats_1[2], 
        density_feats_1[3], 
        vec4(dir * 0.5 + 0.5, 1.0)
    );
    vec4[4] rgb_feats_0 = rgb_layer_0(color_input);
    vec3 rgb = rgb_layer_1(rgb_feats_0);

    rgb = sigmoid(rgb);

    return vec4(rgb, alpha);
}
void main(){
    vec3 rayDir = normalize( vDirection );
    vec2 bounds = hitBox( vOrigin, rayDir );

    if ( bounds.x > bounds.y ) {
        discard;
    }
    // vec4 [4] sh_feats = compute_sh_feats(rayDir);
    
    bounds.x = max( bounds.x, 0.0 );
    vec3 p = vOrigin + bounds.x * rayDir;
    vec3 inc = 1.0 / abs( rayDir );

    float grid_step_size = render_step;

    vec3 rgb = vec3(0.0, 0.0, 0.0);
    float acc_trans = 1.0;
    float t = bounds.x;
    int iter_count = 0;
    while(t < bounds.y && iter_count < MAX_ITERS){
        p = vOrigin + rayDir * t;
        float grid = sample_grid(p);
        if (grid < min_alpha){
            t = t + grid_step_size;
            iter_count += 1;
            continue;
        }
        
        // at this point, we have hit something in grid.
        vec4 rgba = query(p, rayDir, t, grid_step_size, output_mode);
        float alpha = rgba.a;
        if (alpha < 0.01){
            t = t + grid_step_size;
            iter_count += 1;
            continue;
        }
        float weight = alpha * acc_trans;
        rgb += weight * rgba.rgb;
        acc_trans *= (1.0 - alpha);

        if (acc_trans < 0.01) {
            break;
        }
        t = t + grid_step_size;
        iter_count += 1;
    }
    if (acc_trans > 0.97){
        discard;
    }
    gl_FragColor = vec4(rgb, 1.0);
}
