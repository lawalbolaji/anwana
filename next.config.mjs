/** @type {import('next').NextConfig} */
import CopyPlugin from "copy-webpack-plugin";

const nextConfig = {
    /* need to server these binaries for VAD to work - https://wiki.vad.ricky0123.com/docs/user/browser#bundling:~:text=You%20will%20also%20need%20to */
    webpack: (config, {}) => {
        config.plugins.push(
            new CopyPlugin({
                patterns: [
                    {
                        from: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
                        to: "./static/chunks/[name][ext]",
                    },
                    {
                        from: "node_modules/@ricky0123/vad-web/dist/*.onnx",
                        to: "./static/chunks/[name][ext]",
                    },
                    { from: "node_modules/onnxruntime-web/dist/*.wasm", to: "./static/chunks/[name][ext]" },
                ],
            })
        );

        return config;
    },
};

export default nextConfig;
