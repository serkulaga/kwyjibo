/*********************************************************************************

MIT License

Copyright (c) 2016 - Miguel Ángel Pérez Martínez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*********************************************************************************/

import * as Express from "express";
import * as U from "./utils";
import * as D from "./documentation";
import * as T from "./testing";
import * as FS from "fs";
import * as Path from "path";
import * as Stream from "stream";

export interface IDisposable {
    dispose(): void;
}

/**
 * Contains context for the current call . 
 */
export class Context {
    request: Express.Request;
    response: Express.Response;
    nextMiddleware: Function;

    private disposableInstances: IDisposable[];

    constructor() {
        this.disposableInstances = [];
    }

    create<T extends IDisposable>(tFactory: { new (...args: any[]): T; }, ...args: any[]): T {
        let instance = new tFactory(...args);
        this.disposableInstances.push(instance);
        return instance;
    }

    dispose(): void {
        for (let instance of this.disposableInstances) {
            instance.dispose();
        }
    }
}

export class HttpError {
    code: number;
    message: string;
    constructor(code: number, messageOrError: string | Error) {
        this.code = code;
        if (messageOrError != undefined) {
            if (messageOrError instanceof Error) {
                this.message = messageOrError.message;
            } else {
                this.message = messageOrError.toString();
            }
        } else {
            this.message = "";
        }
    }
}

export class BadRequest extends HttpError {
    constructor(messageOrError: string | Error) {
        super(400, messageOrError);
    }
}

export class Unauthorized extends HttpError {
    constructor(messageOrError: string | Error) {
        super(401, messageOrError);
    }
}

export class NotFound extends HttpError {
    constructor(messageOrError: string | Error) {
        super(404, messageOrError);
    }
}

export class InternalServerError extends HttpError {
    constructor(messageOrError: string | Error) {
        super(500, messageOrError);
    }
}

export class FileServe {
    file: string | Stream.Readable;
    filename: string;
    contentType: string;
    forceAttachment: boolean;

    constructor(file: string | Stream.Readable, filename?: string, extension?: string, forceAttachment?: boolean) {
        this.file = file;
        this.filename = filename != undefined ? filename : (typeof (file) === "string" ? (Path.basename(file)) : "file");
        extension = extension != undefined ? extension : this.filename;
        this.contentType = require("mime-types").contentType(extension);
        this.forceAttachment = !!forceAttachment;
    }

    sendHeaders(res: Express.Response) {
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", this.contentType);
        res.setHeader("Content-Disposition", `${this.forceAttachment ? "attachment" : "inline"}; filename=${this.filename}`);
    }
}

export let globalKCState: KwyjiboControllersState;

/*********************************************************
 * Class Decorators  
 *********************************************************/

/**
 * Registers a new controller.
 * @param { string | Controller } [mountpoint] - An string indicating a path, or a Controller to mount over. If not present, the name of the class will be used as path.
 * @param { string } [path] - Used if mountpoint is a Controller. If not present, the name of the class will be used as path.     
 */
export function Controller<T>(mountpoint?: string | KwyjiboControllerConstructor<T>, path?: string): (f: Function) => void {
    return (ctr: Function) => {
        let c = globalKCState.getOrInsertController(ctr);
        c.explicitlyDeclared = true;
        if (mountpoint != undefined) {
            if (typeof (mountpoint) === "string") {
                c.path = mountpoint as string;
            } else {
                globalKCState.registerMountPoint(mountpoint as any, ctr);
                c.path = (typeof (path) === "string") ? path : ctr.name;
            }
        } else {
            c.path = ctr.name;
        }
        c.path = U.UrlJoin("/", c.path);
    };
}

/** 
 * Adds express middleware to run before mounting the controller 
 * @param { Express.RequestHandler[] } middleware - Array of middleware to add.
 */
export function Middleware(...middleware: Express.RequestHandler[]): (f: Function) => void {
    return (ctr: Function) => {
        if (middleware != undefined) {
            let c = globalKCState.getOrInsertController(ctr);
            c.middleware = middleware.concat(c.middleware);
        }
    };
}

/** 
 * @param { boolean } condition - Only mounts this controller if condition is true. 
 */
export function MountCondition(condition: boolean): (f: Function) => void {
    return (ctr: Function) => {
        let c = globalKCState.getOrInsertController(ctr);
        c.mountCondition = c.mountCondition && condition;
    };
}

/** 
 *  Only mounts this controller if NODE_ENV is set to "development"
 */
export function Dev(): (f: Function) => void {
    return MountCondition(process.env.NODE_ENV === "development");
}

/**
 *  Attach a documentation string to the controller
 *  @param {string} docStr - The documentation string.
 */
export function DocController(docStr: string): (f: Function) => void {
    return (ctr: Function) => {
        globalKCState.getOrInsertController(ctr).docString = docStr;
    };
}

/**
 * Generate test runner paths inside this controller
 */
export function TestRunner(): (f: Function) => void {
    return (ctr: Function) => {
        globalKCState.getOrInsertController(ctr).generateTestRunnerPaths = true;
    };
}

/*********************************************************
 * Method Decorators  
 *********************************************************/

export function Method(method: string, path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        path = (path != undefined) ? path : propertyKey;
        method = method.toLowerCase();
        let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);
        m.methodMountpoints.push({ "path": U.UrlJoin("/", path), "httpMethod": method });
        m.explicitlyDeclared = true;
    };
}

export function Get(path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return Method("get", path);
}

export function Post(path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return Method("post", path);
}

export function Put(path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return Method("put", path);
}

export function Patch(path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return Method("patch", path);
}

export function Delete(path?: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return Method("delete", path);
}

/** 
 * Adds express middleware to run before the method 
 * @param { Express.RequestHandler[] } middleware - Array of middleware to add.
 */
export function ActionMiddleware(...middleware: Express.RequestHandler[]): (a: any, s: string, pd: PropertyDescriptor) => void {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        if (middleware != undefined) {
            let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);
            m.middleware = middleware.concat(m.middleware);
        }
    };
}

/**
 * Flags the method as "Express Compatible" and thus will be called with parameters (req,res,next)
 */
export function ExpressCompatible(): (a: any, s: string, pd: PropertyDescriptor) => void {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);
        m.expressCompatible = true;
    };
}


/**
 *  Attach a documentation string to the method
 *  @param {string} docStr - The documentation string.
 */
export function DocAction(docStr: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);
        m.docString = docStr;
    };
}

/**
 *  Attach a OpenApi Response to the method
 *  @param {number|string} httpCode - The http code used for the response
 *  @param {string} description - Response description
 *  @param {string} type - The Open Api defined type.
 */

export function OpenApiResponse(httpCode: number | string, description: string, type: string): (a: any, s: string, pd: PropertyDescriptor) => void {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);

        httpCode = httpCode.toString();
        m.openApiResponses[httpCode] = { description: description, type: type };
    };
}

/*********************************************************
 * Method Parameters Decorators  
 *********************************************************/

export type RequestValueContainer = "body" | "query" | "path" | "header" | "cookie";

export function MapParameterToRequestValue(rvc: RequestValueContainer, valueKey: string, openApiType?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return function (target: any, propertyKey: string, parameterIndex: number) {
        let m = globalKCState.getOrInsertController(target.constructor).getOrInsertMethod(propertyKey);
        m.extraParametersMappings[parameterIndex] = { "rvc": rvc, "valueKey": valueKey, "openApiType": openApiType };
    };
}

export function FromBody(openApiType?: string, valueKey?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return MapParameterToRequestValue("body", valueKey, openApiType);
}

export function FromQuery(valueKey: string, openApiType?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return MapParameterToRequestValue("query", valueKey, openApiType);
}

export function FromPath(valueKey: string, openApiType?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return MapParameterToRequestValue("path", valueKey, openApiType);
}

export function FromHeader(valueKey: string, openApiType?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return MapParameterToRequestValue("header", valueKey, openApiType);
}
export function FromCookie(valueKey: string, openApiType?: string): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void {
    return MapParameterToRequestValue("cookie", valueKey, openApiType);
}

/*********************************************************
 * Utils
 *********************************************************/

export function DumpInternals(): void {
    for (let ck in globalKCState.controllers) {
        console.log("============================================");
        console.log(`Controller on path ${globalKCState.controllers[ck].path} built from Class ${globalKCState.controllers[ck].ctr.name}`);
        console.log("With Methods:");
        for (let mk in globalKCState.controllers[ck].methods) {
            let m = globalKCState.controllers[ck].methods[mk];
            console.log(`== ${mk} ==`);
            console.log(m);
            console.log("");
        }
    }
}

/*********************************************************
 * Internals
 *********************************************************/

export type KwyjiboMethodMountpoint = { path: string; httpMethod: string };
export type KwyjiboExtraParametersMapping = { rvc: RequestValueContainer; valueKey: string; openApiType: string; };

export class KwyjiboMethodOpenApiResponses {
    [httpCode: string]: { description: string; type: string; }
}

export class KwyjiboMethod {
    methodMountpoints: KwyjiboMethodMountpoint[] = [];
    middleware: Express.RequestHandler[] = [];
    extraParametersMappings: KwyjiboExtraParametersMapping[] = [];
    expressCompatible: boolean = false;
    docString: string = "";
    openApiResponses: KwyjiboMethodOpenApiResponses = {};
    explicitlyDeclared: boolean = false;
}

export type KwyjiboMethodMap = { [key: string]: KwyjiboMethod };
export type KwyjiboControllerConstructor<T> = { new (...args: any[]): T; };

export class KwyjiboController {
    path: string;
    ctr: Function;
    middleware: Express.RequestHandler[] = [];
    methods: KwyjiboMethodMap = {};
    docString: string = "";

    router: Express.Router;

    generateTestRunnerPaths: boolean = false;
    childController: boolean = false;

    node: KwyjiboControllerTreeNode = undefined;

    /**
     * Set to true by the Controller decorator to assert that 
     * it was explicitly declared.
     */
    explicitlyDeclared: boolean = false;

    /**
     * If mountCondition is false, the controller not be mounted.
     */
    mountCondition: boolean = true;

    getOrInsertMethod(key: string): KwyjiboMethod {
        if (this.methods[key] == undefined) {
            this.methods[key] = new KwyjiboMethod();
        }
        return this.methods[key];
    }

}

export class KwyjiboControllerTreeNode {
    controller: KwyjiboController;
    childs: KwyjiboControllerTreeNode[] = [];
    fullPath: string;
    constructor(controller: KwyjiboController) {
        this.controller = controller;
        this.fullPath = controller.path;
    }
}

export type KwyjiboControllerMap = { [key: string]: KwyjiboController };
export type KwyjiboMountpoint = { dstCtr: Function; ctr: Function };

export class KwyjiboControllersState {

    controllers: KwyjiboControllerMap = {};
    mountpoints: KwyjiboMountpoint[] = [];

    controllersTree: KwyjiboControllerTreeNode[] = [];

    getController(ctr: Function): KwyjiboController {
        return this.controllers[ctr.toString()];
    }

    getOrInsertController(ctr: Function): KwyjiboController {
        let key = ctr.toString();
        if (this.controllers[key] == undefined) {
            this.controllers[key] = new KwyjiboController();
            this.controllers[key].ctr = ctr;
        }
        return this.controllers[key];
    }

    registerMountPoint(dstCtr: any, ctr: Function): void {
        this.getOrInsertController(ctr).childController = true;
        this.mountpoints.push({ "dstCtr": dstCtr, "ctr": ctr });
    }

}

globalKCState = new KwyjiboControllersState();

function addChildsToTreeNode(node: KwyjiboControllerTreeNode): void {

    node.controller.node = node;

    for (let mp of globalKCState.mountpoints) {
        if (node.controller.ctr.toString() === mp.dstCtr.toString()) {
            let child = new KwyjiboControllerTreeNode(globalKCState.getController(mp.ctr));
            addChildsToTreeNode(child);
            node.childs.push(child);
        }
    }
}

function buildControllersTree() {
    for (let ck in globalKCState.controllers) {
        let c = globalKCState.controllers[ck];
        if (c.childController === false) {
            let node = new KwyjiboControllerTreeNode(c);
            addChildsToTreeNode(node);
            globalKCState.controllersTree.push(node);
        }
    }
}

function indexAutogenerator(controller: KwyjiboController, childs: KwyjiboControllerTreeNode[]): (req: Express.Request, res: Express.Response) => void {
    return (req: Express.Request, res: Express.Response) => {
        let content = "<html><head></head><body><pre> Autogenerated Index (Only in dev env) <br /><br />";

        for (let child of childs) {
            content += `[Controller] <a href=".${child.controller.path}/">${child.controller.path}</a><br />`;
        }
        content += "<br />";

        if (controller != undefined) {
            for (let mk in controller.methods) {
                for (let mmp of controller.methods[mk].methodMountpoints) {
                    content += `[${mmp.httpMethod.toUpperCase()}] <a href=".${mmp.path}/">${mmp.path}</a><br />`;
                }
            }
        }

        content += "</pre></body></html>";
        res.send(content);
    };
}

async function serveFile(res: Express.Response, file: FileServe) {
    if (typeof (file.file) === "string") {

        await new Promise((resolve, reject) => {
            FS.access(file.file as string, FS["R_OK"], (err) => {
                if (err != undefined) {
                    throw new NotFound(err);
                }

                let filestream = FS.createReadStream(file.file as string);
                file.sendHeaders(res);
                filestream.pipe(res);
            });
        });

    } else if (file.file instanceof Stream.Readable) {
        file.sendHeaders(res);
        file.file.pipe(res);
    } else {
        throw new Error("Invalid file type on FileServe");
    }

}

function mountMethod(controller: KwyjiboController, instance: any, methodKey: string): void {

    let method: KwyjiboMethod = controller.methods[methodKey];

    if (method.explicitlyDeclared === false) {
        U.defaultWarnLogger(`Method ${methodKey} was not explicitaly declared with a decorator. Defaulting to GET@/${methodKey}`);
        method.methodMountpoints.push({ "path": `/${methodKey}`, "httpMethod": "get" });
    }

    for (let mp of method.methodMountpoints) {
        let callback = (req: Express.Request, res: Express.Response, next: Function) => {

            let context = new Context();

            let runner = async () => {
                let ret: any;

                if (method.expressCompatible) {
                    ret = instance[methodKey](req, res, next);
                } else {
                    context.request = req;
                    context.response = res;
                    context.nextMiddleware = next;

                    let params: any[] = [context];

                    if (method.extraParametersMappings[0] != undefined) {
                        throw new Error("Cannot map first parameter, it always will contain Context!");
                    }

                    for (let i = 1; i < method.extraParametersMappings.length; i++) {
                        let mp = method.extraParametersMappings[i];
                        if (mp == undefined) {
                            params.push(undefined);
                        } else {
                            switch (mp.rvc) {
                                case "body":
                                    if (mp.valueKey == undefined || mp.valueKey === "") {
                                        params.push(req.body);
                                    } else {
                                        params.push(req.body[mp.valueKey]);
                                    }
                                    break;
                                case "query":
                                    params.push(req.query[mp.valueKey]);
                                    break;
                                case "path":
                                    params.push(req.params[mp.valueKey]);
                                    break;
                                case "header":
                                    params.push(req.headers[mp.valueKey]);
                                    break;
                                case "cookie":
                                    params.push(req.cookies[mp.valueKey]);
                                    break;
                            }

                        }
                    }

                    ret = instance[methodKey](...params);
                }

                if (ret instanceof Promise) {
                    ret = await ret;
                }

                if (ret instanceof FileServe) {
                    serveFile(res, ret);
                } else if (ret instanceof Object) {
                    if (ret["$render_view"] != undefined) {
                        res.render(ret["$render_view"], ret);
                    } else {
                        res.json(ret);
                    }
                } else if (typeof (ret) === "string") {
                    res.send(ret);
                }
            };

            runner().then(() => { context.dispose(); })
                .catch((err) => { context.dispose(); next(err); });

        };
        controller.router[mp.httpMethod](U.UrlJoin(mp.path, "/"), ...method.middleware, callback);
    }

}

function useRouterAtPathStrict(baseRouter: Express.Router | Express.Application, basePath: string, router: Express.Router): void {

    if (basePath.substring(basePath.length - 1) === "/") {
        basePath = basePath.trim().substr(0, basePath.length - 1);
    }

    let strictPath = U.UrlJoin(basePath, "/");

    if (strictPath !== "/") {

        baseRouter.use(strictPath, (req: any, res: any, next: any) => {

            if (req.originalUrl.substring(req.originalUrl.length - basePath.length) === basePath) {
                res.redirect(strictPath);
            } else {
                next();
            }

        }, router);

    } else {
        baseRouter.use(strictPath, router);
    }

}

function createRouterRecursive(app: Express.Application, controllerNode: KwyjiboControllerTreeNode): KwyjiboController {

    let controller = controllerNode.controller;

    controllerNode.fullPath = controller.path;

    if (controller.mountCondition === false) {
        return undefined;
    }

    if (controller.explicitlyDeclared === false) {
        U.defaultWarnLogger(`Controller ${controller.ctr.name} was not explicitaly declared with a @Controller decorator.`);
    }

    let instance = Reflect.construct(controller.ctr, []);
    controller.router = Express.Router({ mergeParams: true });

    for (let middleware of controller.middleware) {
        controller.router.use(middleware);
    }

    for (let mk in controller.methods) {
        mountMethod(controller, instance, mk);
    }

    for (let child of controllerNode.childs) {
        let nc = createRouterRecursive(app, child);
        if (nc != undefined) {
            useRouterAtPathStrict(controller.router, nc.path, nc.router);
            child.fullPath = U.UrlJoin(controllerNode.fullPath, "/", child.fullPath);
        }
    }

    if (controller.generateTestRunnerPaths) {
        T.injectTestRunnerMiddleware(controller);
    }

    if (process.env.NODE_ENV === "development") {
        controller.router.get("/", indexAutogenerator(controller, controllerNode.childs));
    }

    return controller;
}

function handleRequestErrorMiddlewares(err: any, req: Express.Request, res: Express.Response, next: Function): void {
    for (let i = 0; i < U.errorHandlers.length - 1; i++) {
        U.errorHandlers[i](err, req, res, U.errorHandlers[i + 1]);
    }

    if (U.errorHandlers.length > 0) {
        U.errorHandlers[U.errorHandlers.length - 1](err, req, res, onRequestError);
    } else {
        onRequestError(err, req, res, next);
    }
}

function onRequestError(err: any, req: Express.Request, res: Express.Response, next: Function): void {

    if (err.name === "UnauthorizedError") {
        res.sendStatus(401);
    } else {
        if (process.env.NODE_ENV === "development") {
            res.statusCode = 500;
            if (err instanceof HttpError) {
                U.defaultErrorLogger(err);
                res.status(err.code).send(err.message);
            } else if (err instanceof Error) {
                U.defaultErrorLogger({ name: err.name, message: err.message, stack: err.stack });
                res.json({ name: err.name, message: err.message });
            } else {
                U.defaultErrorLogger(err);
                res.json(err);
            }
        } else {
            res.sendStatus(500);
        }
    }
}

function onRequestNotFound(req: Express.Request, res: Express.Response, next: Function): void {
    res.sendStatus(404);
}

export let initialized = false;

export function initialize(app: Express.Application, ...requiredDirectories: string[]): void {
    initializeAtRoute("/", app, ...requiredDirectories);
}

export function initializeAtRoute(rootPath: string, app: Express.Application, ...requiredDirectories: string[]): void {

    let implicitTests = false;
    let implicitControllers = false;

    if (!requiredDirectories.find((p) => { return p === "tests"; })) {
        requiredDirectories.push("tests");
        implicitTests = true;
    }

    if (!requiredDirectories.find((p) => { return p === "controllers"; })) {
        requiredDirectories.push("controllers");
        implicitControllers = true;
    }

    for (let requiredDirectory of requiredDirectories) {

        let path = "";

        if (Path.isAbsolute(requiredDirectory)) {
            path = requiredDirectory;
        } else {
            path = Path.join(process.cwd(), requiredDirectory);
        }

        try {
            U.defaultInfoLogger("Loading components from: " + path);
            FS.accessSync(path);
        } catch (err) {
            if ((requiredDirectory !== "controllers" || !implicitControllers) &&
                (requiredDirectory !== "tests" || !implicitTests)) {
                U.defaultWarnLogger("Cannot access path: " + path);
            }
            continue;
        }

        require("require-all")(path);

    }

    rootPath = rootPath || "/";

    buildControllersTree();

    for (let node of globalKCState.controllersTree) {
        let nc = createRouterRecursive(app, node);
        if (nc != undefined) {
            useRouterAtPathStrict(app, U.UrlJoin(rootPath, nc.path), nc.router);
            node.fullPath = U.UrlJoin(rootPath, "/", node.fullPath);
        }
    }

    if (process.env.NODE_ENV === "development") {
        app.get(rootPath, indexAutogenerator(undefined, globalKCState.controllersTree));
    }

    app.use(handleRequestErrorMiddlewares);
    app.use(onRequestNotFound);
    initialized = true;
}

export function getActionRoute<T>(controller: KwyjiboControllerConstructor<T>, methodName: string, httpMethod?: string) {

    let kc = globalKCState.getOrInsertController(controller);

    if (kc.methods[methodName] != undefined) {
        let method = kc.methods[methodName];

        if (httpMethod == undefined && method.methodMountpoints.length > 0) {
            return U.UrlJoin(kc.node.fullPath, "/", method.methodMountpoints[0].path);
        }

        for (let mp of method.methodMountpoints) {
            if (mp.httpMethod.toLowerCase() === httpMethod.toLowerCase()) {
                return U.UrlJoin(kc.node.fullPath, "/", mp.path);
            }
        }
    }

    return "";
}

function controllerDocToRoutes(controllers: D.ControllerDocNode[], baseUrl?: string, replacements?: U.Dictionary<string>) {
    if (baseUrl == undefined) {
        baseUrl = "";
    }

    if (replacements == undefined) {
        replacements = {};
    }

    let routes: any = {};
    for (let controller of controllers) {
        routes[controller.name] = {};
        for (let method of controller.methods) {
            routes[controller.name][method.name] = {};
            for (let mountPoint of method.mountpoints) {
                let url = baseUrl + controller.path + mountPoint.path;

                for (let key in replacements) {
                    url = url.replace(new RegExp(key, "g"), replacements[key]);
                }

                routes[controller.name][method.name][mountPoint.httpMethod] = url;
            }
        }

        let childRoutes = controllerDocToRoutes(controller.childs, controller.path);

        routes = {
            ...routes,
            ...childRoutes
        };
    }

    return routes;
}

export function getRoutes(replacements ?: U.Dictionary<string>) {
    return controllerDocToRoutes(D.getDocs(), undefined, replacements);
}

