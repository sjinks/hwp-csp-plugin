import { equal, ok } from 'node:assert/strict';
import path from 'node:path';
import webpack, { type Compiler, type WebpackPluginFunction, type WebpackPluginInstance } from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { fs, vol } from 'memfs';

export function getHWP(file: string, xhtml: boolean, output = 'index.html'): HtmlWebpackPlugin {
    return new HtmlWebpackPlugin({
        filename: output,
        showErrors: true,
        xhtml,
        template: path.join(__dirname, 'data', file),
    });
}

export function getWebpackConfig(plugins: (WebpackPluginFunction | WebpackPluginInstance)[]): webpack.Configuration {
    return {
        mode: 'development',
        entry: {
            entry: path.join(__dirname, 'data', 'index.js'),
        },
        output: {
            path: '/build',
        },
        plugins,
    };
}

const filesystem = {
    join: path.join.bind(path),
    mkdir: fs.mkdir.bind(fs),
    rmdir: fs.rmdir.bind(fs),
    unlink: fs.unlink.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    stat: fs.stat.bind(fs),
    readFile: fs.readFile.bind(fs),
    relative: path.relative.bind(path),
    dirname: path.dirname.bind(path),
} as Compiler['outputFileSystem'];

function getOutput(): Record<string, string> {
    const result: Record<string, string> = {};
    const dir = '/build';

    (fs.readdirSync(dir) as string[])
        .filter((file: string): boolean => file.endsWith('.html'))
        .forEach((file: string): void => {
            result[file] = fs.readFileSync(path.join(dir, file)).toString('utf-8');
        });

    return result;
}

type Callback = (html: Record<string, string>) => void;

export function runWebpack(
    config: webpack.Configuration | webpack.Configuration[],
    callback: Callback,
    done: (result?: unknown) => void,
): void {
    const cfg = Array.isArray(config) ? config : [config];
    vol.reset();
    const instance = webpack(cfg);
    ok(instance);
    instance.compilers.forEach((compiler) => (compiler.outputFileSystem = filesystem));
    instance.run((err, stats): void => {
        try {
            const st: webpack.Stats[] = stats?.stats ?? [];
            equal(!!err, false);
            st.forEach((entry) => {
                if (entry.compilation.warnings.length) {
                    console.warn(entry.compilation.warnings);
                }

                if (entry.compilation.errors.length) {
                    console.error(entry.compilation.errors);
                }

                equal(entry.compilation.errors.length, 0);
                equal(entry.compilation.warnings.length, 0);
            });

            const html = getOutput();
            callback(html);
            done();
        } catch (e) {
            done(e);
        }
    });
}
