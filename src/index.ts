import crypto from 'crypto';
import type webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import cheerio from 'cheerio';
import serialize from 'dom-serializer';

export type CspHash = 'sha256' | 'sha384' | 'sha512';

interface EnabledHashes {
    script?: boolean;
    style?: boolean;
}

export interface Options {
    enabled?: boolean;
    policy?: Record<string, string | string[]>;
    hashFunc?: CspHash;
    hashEnabled?: EnabledHashes | boolean;
    addIntegrity?: boolean;
}

interface NormalizedOptions {
    enabled: boolean;
    policy: Record<string, string>;
    hashFunc: CspHash;
    hashEnabled: Required<EnabledHashes>;
    addIntegrity: boolean;
}

const PLUGIN = 'HwpCspPlugin';

export class HwpCspPlugin {
    protected _options: NormalizedOptions;

    public constructor(options?: Options) {
        this._options = {
            enabled: options?.enabled ?? true,
            policy: HwpCspPlugin._normalizePolicy(options?.policy ?? {}),
            hashFunc: options?.hashFunc || 'sha384',
            addIntegrity: !!options?.addIntegrity,
            hashEnabled: {
                script:
                    typeof options?.hashEnabled === 'boolean'
                        ? options.hashEnabled
                        : options?.hashEnabled?.script ?? true,
                style:
                    typeof options?.hashEnabled === 'boolean'
                        ? options.hashEnabled
                        : options?.hashEnabled?.style ?? true,
            },
        };

        if (
            !Object.keys(this._options.policy).length &&
            !this._options.hashEnabled.script &&
            !this._options.hashEnabled.style
        ) {
            this._options.enabled = false;
        }
    }

    public apply(compiler: webpack.Compiler): void {
        if (this._options.enabled) {
            compiler.hooks.compilation.tap(PLUGIN, (compilation): void => {
                const hooks = HtmlWebpackPlugin.getHooks(compilation);
                hooks.beforeEmit.tapAsync(PLUGIN, (data, cb): unknown => {
                    data.html = this._processHTML(data.html, data.plugin);
                    return cb(null, data);
                });
            });
        }
    }

    private _processHTML(html: string, plugin: HtmlWebpackPlugin): string {
        const $ = cheerio.load(html);
        let scriptHashes: string | undefined;
        let styleHashes: string | undefined;

        if (this._options.hashEnabled.script) {
            const scripts = $('script:not([src])');
            scriptHashes = this._getHashes(scripts, $).join(' ');
        }

        if (this._options.hashEnabled.style) {
            const styles = $('style');
            styleHashes = this._getHashes(styles, $).join(' ');
        }

        const policy = { ...this._options.policy };
        if (scriptHashes) {
            policy['script-src'] = (policy['script-src'] || '') + ' ' + scriptHashes;
            if (policy['script-src-elem']) {
                policy['script-src-elem'] += ' ' + scriptHashes;
            }
        }

        if (styleHashes) {
            policy['style-src'] = (policy['style-src'] || '') + ' ' + styleHashes;
            if (policy['style-src-elem']) {
                policy['style-src-elem'] += ' ' + styleHashes;
            }
        }

        const newPolicy = HwpCspPlugin._buildPolicy(policy);
        if (newPolicy) {
            $('meta[http-equiv]')
                .filter(
                    (i, el): boolean =>
                        (el as cheerio.TagElement).attribs['http-equiv'].toLowerCase() === 'content-security-policy',
                )
                .remove();

            const meta = $('<meta http-equiv="Content-Security-Policy"/>');
            meta.attr('content', newPolicy);
            $('head').prepend(meta);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const isXHTML = !!(plugin as any).options?.xhtml;
            const options = isXHTML ? { selfClosingTags: true, emptyAttrs: true } : {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return serialize(($ as any)._root.children, options);
        }

        return html;
    }

    private _getHashes(elements: cheerio.Cheerio, $: cheerio.Root): string[] {
        const { addIntegrity, hashFunc } = this._options;
        return elements.get().map((e: cheerio.Element): string => {
            const s = $(e).html() || '';
            const hash = `${hashFunc}-${HwpCspPlugin._cspHash(s, hashFunc)}`;
            if (addIntegrity && !$(e).attr('integrity')) {
                $(e).attr('integrity', hash);
            }

            return `'${hash}'`;
        });
    }

    private static _normalizePolicy(policy: Record<string, string | string[]>): Record<string, string> {
        const result: Record<string, string> = {};

        Object.keys(policy).forEach((key: string): void => {
            const value = policy[key];
            let v: string;

            if (Array.isArray(value)) {
                v = [...new Set(value)].join(' ');
            } else {
                v = value.trim();
            }

            result[key] = v;
        });

        return result;
    }

    private static _cspHash(s: string, hash: CspHash): string {
        return crypto.createHash(hash).update(s, 'utf8').digest('base64');
    }

    private static _buildPolicy(policy: Record<string, string>): string {
        return Object.keys(policy)
            .map((key: string): string => {
                const value = policy[key].trim();
                return value ? `${key} ${value}` : key;
            })
            .join('; ');
    }
}
