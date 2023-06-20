import vertexShader from '../shaders/vertex.wgsl'
import fragmentShader from '../shaders/fragment.wgsl'
import computeShader from '../shaders/compute.wgsl'
import {InfoInterface} from "../index";

function getTime() {
    return (new Date()).getMilliseconds()
}

function getRandomValue(v1: number, v2 = 0) {
    const max = Math.max(v1, v2)
    const min = Math.min(v1, v2)
    return Math.random() * (max - min) + min;
}

function getInRange(range: [number, number]) {
    return getRandomValue(...range)
}

function radians(angle: number) {
    return angle / 180 * Math.PI
}

export default class {
    canvas: HTMLCanvasElement;
    info: InfoInterface
    step: number
    resolution: [number, number]
    fieldResolution: [number, number]
    paramsCount: number
    workgroupSize: number
    workgroupProcessFieldCount: [number, number]

    // API Data Structures
    adapter: GPUAdapter;
    device: GPUDevice;
    queue: GPUQueue;

    // Frame Backings
    context: GPUCanvasContext;
    canvasFormat: GPUTextureFormat;

    // Arrays
    vertexArray: Float32Array
    uniformTimeArray: Float32Array
    uniformResolutionArray: Uint32Array
    uniformFieldResolutionArray: Uint32Array
    fieldStateArray: Float32Array

    // Buffers
    vertexBuffer: GPUBuffer
    uniformTimeBuffer: GPUBuffer
    uniformResolutionBuffer: GPUBuffer
    uniformFieldResolutionBuffer: GPUBuffer
    fieldStateBuffers: GPUBuffer[]

    // Layouts
    vertexBufferLayout: GPUVertexBufferLayout
    bindGroupLayout: GPUBindGroupLayout
    pipelineLayout: GPUPipelineLayout

    // Bind groups
    bindGroups: GPUBindGroup[]

    // Pipelines
    processFieldPipeline: GPUComputePipeline
    updateFieldPipeline: GPUComputePipeline
    renderPipeline: GPURenderPipeline

    constructor(canvas: HTMLCanvasElement, info: InfoInterface) {
        this.canvas = canvas
        this.info = info
        this.step = 0
        this.fieldResolution = [canvas.width / 2, canvas.height / 2];
        this.resolution = [canvas.width, canvas.height];
        this.paramsCount = 3
        this.workgroupSize = 8;

        this.workgroupProcessFieldCount = [Math.ceil(this.fieldResolution[0] / this.workgroupSize),
            Math.ceil(this.fieldResolution[1] / this.workgroupSize)];
    }

    start() {
        const encoder = this.device.createCommandEncoder();
        this.render(encoder)
        this.queue.submit([encoder.finish()]);

        setTimeout(() => {
            requestAnimationFrame(() => this.update())
        }, 1)
    }

    update() {
        const t = getTime()

        const encoder = this.device.createCommandEncoder();

        for (let i = 0; i < 1; i++) {
            this.updateField(encoder)
            this.step++
            this.processField(encoder)
        }
        this.render(encoder)
        this.queue.submit([encoder.finish()]);

        const dt = getTime() - t
        this.info.renderTime.innerText = `${dt} ms`
        this.uniformTimeArray[0] = this.step;
        this.writeBuffer(this.uniformTimeBuffer, this.uniformTimeArray)
        requestAnimationFrame(() => this.update())
    }

    rect(rectPos: [number, number], size: [number, number], vel: number, mass: number, height: number) {
        for (let x = rectPos[0]; x < rectPos[0] + size[0]; x++) {
            for (let y = rectPos[1]; y < rectPos[1] + size[1]; y++) {
                const pos = x + y * this.fieldResolution[0]
                const idx = pos * 3
                this.fieldStateArray[idx] = height
                this.fieldStateArray[idx + 1] = vel
                this.fieldStateArray[idx + 2] = mass
            }
        }
    }

    initField() {
        for (let i = 0; i < this.fieldResolution[0] * this.fieldResolution[1]; i++) {
            const idx = i * 3
            this.fieldStateArray[idx] = 0
            this.fieldStateArray[idx + 1] = 0
            this.fieldStateArray[idx + 2] = 1
        }
        // this.rect([this.fieldResolution[0] / 2 + 200, this.fieldResolution[1] / 2 - 200], [1, 1], 1, 1, 1)
        // this.rect([this.fieldResolution[0] / 2 + 200, this.fieldResolution[1] / 2 + 200], [1, 1], 100, 1, 1)

        // for (let x = 0; x < this.fieldResolution[0]; x++) {
        //     for (let y = 0; y < this.fieldResolution[1]; y++) {
        //         const x1 = x - (this.fieldResolution[0] / 2 + 200);
        //         const y1 = y - this.fieldResolution[1] / 2;
        //         const dis = x1 * x1 + y1 * y1
        //         if (dis < 25) {
        //             const pos = x + y * this.fieldResolution[0]
        //             const idx = pos * 3
        //             this.fieldStateArray[idx] = 0
        //             this.fieldStateArray[idx + 1] = 1 - dis / 25
        //             this.fieldStateArray[idx + 2] = 1
        //         }
        //     }
        // }


        // const rectPos = [this.fieldResolution[0] / 2 - 200, 0]
        // const size = [1, this.fieldResolution[1]]
        // for (let x = rectPos[0]; x < rectPos[0] + size[0]; x++) {
        //     for (let y = rectPos[1]; y < rectPos[1] + size[1]; y++) {
        //         if (y > this.fieldResolution[1] / 2 - 10 && y < this.fieldResolution[1] / 2 + 10) {
        //             continue
        //         }
        //         if (y > this.fieldResolution[1] / 2 - 200 && y < this.fieldResolution[1] / 2 - 180) {
        //             continue
        //         }
        //         if (y > this.fieldResolution[1] / 2 + 180 && y < this.fieldResolution[1] / 2 + 200) {
        //             continue
        //         }
        //         const pos = x + y * this.fieldResolution[0]
        //         const idx = pos * 3
        //         this.fieldStateArray[idx] = 0
        //         this.fieldStateArray[idx + 1] = 0
        //         this.fieldStateArray[idx + 2] = 0.000001
        //     }
        // }
    }

    updateField(encoder: GPUCommandEncoder) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.updateFieldPipeline)
        computePass.setBindGroup(0, this.bindGroups[this.step % 2]);
        computePass.dispatchWorkgroups(this.workgroupProcessFieldCount[0], this.workgroupProcessFieldCount[1]);
        computePass.end();
    }

    processField(encoder: GPUCommandEncoder) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.processFieldPipeline)
        computePass.setBindGroup(0, this.bindGroups[this.step % 2]);
        computePass.dispatchWorkgroups(this.workgroupProcessFieldCount[0], this.workgroupProcessFieldCount[1]);
        computePass.end();
    }

    render(encoder: GPUCommandEncoder) {
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: {r: 0, g: 0, b: 0.4, a: 1.0},
                storeOp: "store",
            }]
        });
        pass.setPipeline(this.renderPipeline);
        pass.setBindGroup(0, this.bindGroups[this.step % 2]);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(this.vertexArray.length / 2);
        pass.end();
    }

    async init() {
        if (await this.initApi()) {
            console.log(this.resolution, this.fieldResolution)
            this.initCanvas()
            this.createArrays()
            this.createBuffers()
            this.writeBuffers()
            this.createLayouts()
            this.createBindings()
            this.createPipelines()
            return true
        } else {
            return false
        }
    }

    createArrays() {
        this.vertexArray = new Float32Array([
            -1, -1,
            1, -1,
            1, 1,
            -1, -1,
            1, 1,
            -1, 1,
        ]);
        this.uniformTimeArray = new Float32Array([0]);
        this.uniformResolutionArray = new Uint32Array(this.resolution);
        this.uniformFieldResolutionArray = new Uint32Array(this.fieldResolution);
        this.fieldStateArray = new Float32Array(this.fieldResolution[0] * this.fieldResolution[1] * this.paramsCount);
        this.initField()
    }

    createBuffers() {
        this.vertexBuffer = this.createBuffer('vertices', this.vertexArray, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST)
        this.uniformTimeBuffer = this.createBuffer('uniform time', this.uniformTimeArray, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        this.uniformResolutionBuffer = this.createBuffer('uniform resolution', this.uniformResolutionArray, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        this.uniformFieldResolutionBuffer = this.createBuffer('uniform field resolution', this.uniformFieldResolutionArray, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
        this.fieldStateBuffers = [
            this.createBuffer('Field state A', this.fieldStateArray, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
            this.createBuffer('Field state B', this.fieldStateArray, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST)
        ];
    }

    writeBuffers() {
        this.writeBuffer(this.vertexBuffer, this.vertexArray)
        this.writeBuffer(this.uniformTimeBuffer, this.uniformTimeArray)
        this.writeBuffer(this.uniformResolutionBuffer, this.uniformResolutionArray)
        this.writeBuffer(this.uniformFieldResolutionBuffer, this.uniformFieldResolutionArray)
        this.writeBuffer(this.fieldStateBuffers[0], this.fieldStateArray)
        this.writeBuffer(this.fieldStateBuffers[1], this.fieldStateArray)
    }

    createLayouts() {
        this.vertexBufferLayout = this.createVertexLayout(this.vertexArray.BYTES_PER_ELEMENT * 2, 'float32x2')
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: "Cell Bind Group Layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            }, {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {type: "uniform"}
            }, {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {type: "uniform"}
            }, {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {type: "read-only-storage"}
            }, {
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: "storage"}
            }]
        });
        this.pipelineLayout = this.device.createPipelineLayout({
            label: "Cell Pipeline Layout",
            bindGroupLayouts: [this.bindGroupLayout],
        });
    }

    createBindings() {
        const entries: GPUBindGroupEntry[] = [{
            binding: 0,
            resource: {buffer: this.uniformTimeBuffer}
        }, {
            binding: 1,
            resource: {buffer: this.uniformResolutionBuffer}
        }, {
            binding: 2,
            resource: {buffer: this.uniformFieldResolutionBuffer}
        }, {
            binding: 3,
            resource: {buffer: this.fieldStateBuffers[0]}
        }, {
            binding: 4,
            resource: {buffer: this.fieldStateBuffers[1]}
        }]

        const entries2: GPUBindGroupEntry[] = [...entries]
        entries2[3] = {binding: 3, resource: {buffer: this.fieldStateBuffers[1]}}
        entries2[4] = {binding: 4, resource: {buffer: this.fieldStateBuffers[0]}}

        this.bindGroups = [
            this.device.createBindGroup({
                label: "Cell renderer bind group A",
                layout: this.bindGroupLayout,
                entries: entries,
            }),
            this.device.createBindGroup({
                label: "Cell renderer bind group B",
                layout: this.bindGroupLayout,
                entries: entries2,
            }),
        ];
    }

    createPipelines() {
        const fragmentModule = this.device.createShaderModule({code: fragmentShader});
        const vertexModule = this.device.createShaderModule({code: vertexShader});
        const computeModule = this.device.createShaderModule({code: computeShader});

        this.processFieldPipeline = this.device.createComputePipeline({
            label: "Process field pipeline",
            layout: this.pipelineLayout,
            compute: {
                module: computeModule,
                entryPoint: "processField",
            }
        });

        this.updateFieldPipeline = this.device.createComputePipeline({
            label: "Update field pipeline",
            layout: this.pipelineLayout,
            compute: {
                module: computeModule,
                entryPoint: "updateField",
            }
        });

        this.renderPipeline = this.device.createRenderPipeline({
            label: "Render pipeline",
            layout: this.pipelineLayout,
            vertex: {
                module: vertexModule,
                entryPoint: "vertexMain",
                buffers: [this.vertexBufferLayout]
            },
            fragment: {
                module: fragmentModule,
                entryPoint: "fragmentMain",
                targets: [{
                    format: this.canvasFormat
                }]
            }
        });
    }

    async initApi() {
        try {
            this.adapter = await navigator.gpu.requestAdapter();
            this.device = await this.adapter.requestDevice();
            this.queue = this.device.queue
            console.log('Adapter: ', this.adapter)
            console.log('Device: ', this.device)
        } catch (e) {
            console.log(e)
            return false
        }
        return true
    }

    initCanvas() {
        this.context = this.canvas.getContext("webgpu");
        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.canvasFormat,
        });
    }

    createBuffer(label: string, array: BufferSource, usage: GPUBufferUsageFlags) {
        return this.device.createBuffer({
            label: label,
            size: array.byteLength,
            usage: usage,
        });
    }

    writeBuffer(gpuBuffer: GPUBuffer, data: BufferSource | SharedArrayBuffer) {
        this.queue.writeBuffer(gpuBuffer, /*bufferOffset=*/0, data);
    }

    createVertexLayout(arrayStride: number, format: GPUVertexFormat): GPUVertexBufferLayout {
        return {
            arrayStride: arrayStride,
            attributes: [{
                format: format,
                offset: 0,
                shaderLocation: 0, // Position, see vertex shader
            }],
        };
    }
}