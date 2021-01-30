import path from 'path';
import webpack, { WebpackPluginFunction, WebpackPluginInstance } from 'webpack';
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

const writeFile = (arg0: string, arg1: string | Buffer, arg2: (arg0?: NodeJS.ErrnoException) => void): void =>
    fs.writeFile(arg0, arg1, (error) => arg2(error || undefined));

const mkdir = (arg0: string, arg1: (arg0?: NodeJS.ErrnoException) => void): void =>
    fs.mkdir(arg0, (error) => arg1(error || undefined));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stat = (arg0: string, arg1: (arg0?: NodeJS.ErrnoException, arg1?: any) => void): void =>
    fs.stat(arg0, (error, stats) => arg1(error || undefined, stats));

const readFile = (arg0: string, arg1: (arg0?: NodeJS.ErrnoException, arg1?: string | Buffer) => void): void =>
    fs.readFile(arg0, (error, buf) => arg1(error || undefined, buf));

const filesystem = {
    join: path.join,
    mkdir,
    mkdirp: fs.mkdirp,
    rmdir: fs.rmdir,
    unlink: fs.unlink,
    writeFile,
    readFile,
    stat,
};

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
    done: jest.DoneCallback,
): void {
    const cfg = Array.isArray(config) ? config : [config];
    vol.reset();
    const instance = webpack(cfg);
    instance.compilers.forEach((compiler) => (compiler.outputFileSystem = filesystem));
    instance.run((err, stats): void => {
        try {
            // webpack does not hape typings for MultiStats,
            // and typings for MultiCompiler.run()'s handler are incorrect
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const st: webpack.Stats[] = (stats as any).stats;
            expect(err).toBeFalsy();
            st.forEach((entry) => {
                if (entry.compilation.warnings.length) {
                    console.warn(entry.compilation.warnings);
                }

                if (entry.compilation.errors.length) {
                    console.error(entry.compilation.errors);
                }

                expect(entry.compilation.errors).toHaveLength(0);
                expect(entry.compilation.warnings).toHaveLength(0);
            });

            const html = getOutput();
            callback(html);
            done();
        } catch (e) {
            done(e);
        }
    });
}
