declare module "ws" {
    export type RawData = Buffer | ArrayBuffer | Buffer[];

    type ClientOptions = {
        headers?: Record<string, string>;
    };

    export default class WebSocket {
        static readonly OPEN: number;
        readonly readyState: number;

        constructor(address: string, options?: ClientOptions);

        on(event: "open", listener: () => void): this;
        on(event: "message", listener: (data: RawData) => void): this;
        on(event: "close", listener: (code: number, reason: Buffer) => void): this;
        on(event: "error", listener: (error: Error) => void): this;
        close(): void;
    }
}
