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
import { KwyjiboMethodMountpoint } from "./controller";
export declare class ParamsDoc {
    name: string;
    rvc: string;
    openApiType: string;
}
export declare class ResponsesDoc {
    [httpMethod: string]: {
        description: string;
        type: string;
    };
}
export declare class MethodDoc {
    name: string;
    docString: string;
    mountpoints: KwyjiboMethodMountpoint[];
    params: ParamsDoc[];
    responses: ResponsesDoc;
}
export declare class ControllerDocNode {
    name: string;
    docString: string;
    path: string;
    parent: ControllerDocNode;
    childs: ControllerDocNode[];
    methods: MethodDoc[];
}
export declare function getDocs(): ControllerDocNode[];
export declare function getDocsAsHTML(): string;
