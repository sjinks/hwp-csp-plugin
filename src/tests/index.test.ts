import { equal, notEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { load } from 'cheerio';
import { HwpCspPlugin } from '../index';
import { getHWP, getWebpackConfig, runWebpack } from './utils';

class HwpCspPluginTest extends HwpCspPlugin {
    public options(): (typeof HwpCspPluginTest.prototype)['_options'] {
        return this._options;
    }
}

void describe('HwpCspPlugin', (): void => {
    void it('should not alter a file when disabled', (_, done): void => {
        runWebpack(
            [
                getWebpackConfig([getHWP('script-style.html', false, 'index-1.html')]),
                getWebpackConfig([
                    getHWP('script-style.html', false, 'index-2.html'),
                    new HwpCspPlugin({ enabled: false }),
                ]),
            ],
            (html: Record<string, string>) => equal(html['index-1.html'], html['index-2.html']),
            done,
        );
    });

    (
        [
            [false, false, false, undefined, undefined],
            [false, false, true, undefined, undefined],
            [false, true, false, undefined, undefined],
            [false, true, true, undefined, undefined],
            [true, false, false, undefined, undefined],
            [true, false, true, undefined, 'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x'],
            [true, true, false, 'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa', undefined],
            [
                true,
                true,
                true,
                'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa',
                'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x',
            ],
        ] as const
    ).forEach(([addIntegrity, script, style, hashScript, hashStyle]) => {
        void it(`should add integrity attribute to inline styles and scripts when asked to (${addIntegrity} ${script} ${style})`, (_, done): void => {
            runWebpack(
                getWebpackConfig([
                    getHWP('script-style.html', false),
                    new HwpCspPlugin({ addIntegrity, hashEnabled: { script, style } }),
                ]),
                (html: Record<string, string>): void => {
                    const content = html['index.html'];
                    const $ = load(content);
                    const scripts = $('script:not([src])');
                    const styles = $('style');

                    equal(scripts.length, 1);
                    equal(styles.length, 1);
                    equal(scripts.attr('integrity'), hashScript);
                    equal(styles.attr('integrity'), hashStyle);
                },
                done,
            );
        });
    });

    void it('does not remove existing policies if the policy is empty', (_, done): void => {
        runWebpack(
            getWebpackConfig([getHWP('many-csps.html', false), new HwpCspPlugin({ hashEnabled: false })]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = load(content);
                const metas = $('meta');
                equal(metas.length, 3);

                const map: Record<string, string | undefined> = {
                    'Content-Security-Policy': "default-src 'self'",
                    'content-security-policy': '',
                    'CONTENT-security-policy': undefined,
                };

                metas.each((i, el): void => {
                    const attr = el.attribs['http-equiv'];
                    const expected = map[attr];
                    equal(el.attribs.content, expected);
                });
            },
            done,
        );
    });

    void it('replaces all existing policies with the new one', (_, done): void => {
        runWebpack(
            getWebpackConfig([
                getHWP('many-csps.html', false),
                new HwpCspPlugin({
                    policy: {
                        'default-src': ["'none'"],
                        'script-src': "'self'",
                    },
                    hashEnabled: false,
                }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = load(content);
                const metas = $('meta');
                equal(metas.length, 1);
                equal(metas.attr('http-equiv'), 'Content-Security-Policy');
                equal(metas.attr('content'), `default-src 'none'; script-src 'self'`);
            },
            done,
        );
    });

    void it('leaves file as is if no policy specified and no scripts / styles to hash', (_, done): void => {
        runWebpack(
            getWebpackConfig([
                getHWP('csps-no-scripts-styles.html', false),
                new HwpCspPlugin({ addIntegrity: true, hashEnabled: true }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = load(content);
                const metas = $('meta');
                equal(metas.length, 3);
            },
            done,
        );
    });

    void it('adds hashes to script-src-elem / style-src-elem if they present', (_, done): void => {
        runWebpack(
            getWebpackConfig([
                getHWP('script-style.html', false),
                new HwpCspPlugin({
                    addIntegrity: true,
                    hashEnabled: true,
                    policy: { 'script-src-elem': "'self'", 'style-src-elem': "'self'" },
                }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = load(content);
                const expected = `script-src-elem 'self' 'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa'; style-src-elem 'self' 'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x'; script-src 'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa'; style-src 'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x'`;
                equal($('meta[http-equiv="Content-Security-Policy"]').attr('content'), expected);
            },
            done,
        );
    });

    void it('handles valueless policy attributes properly', (_, done) => {
        runWebpack(
            getWebpackConfig([
                getHWP('script-style.html', false),
                new HwpCspPlugin({
                    hashEnabled: false,
                    policy: { 'block-all-mixed-content': '', 'default-src': "'self'" },
                }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = load(content);
                const expected = `block-all-mixed-content; default-src 'self'`;
                equal($('meta[http-equiv="Content-Security-Policy"]').attr('content'), expected);
            },
            done,
        );
    });

    ([true, false] as const).forEach((xhtml) => {
        void it(`properly handles XHTML mode (${xhtml})`, (_, done): void => {
            runWebpack(
                getWebpackConfig([
                    getHWP('script-style.html', xhtml),
                    new HwpCspPlugin({
                        policy: { 'default-src': "'self'" },
                    }),
                ]),
                (html: Record<string, string>): void => {
                    const content = html['index.html'];
                    const matches = /(<meta[^>]+>)/u.exec(content);
                    notEqual(matches, null);
                    equal(matches![1].endsWith('/>'), xhtml);
                },
                done,
            );
        });
    });

    void describe('option parser', (): void => {
        void it('should enable the plugin by default', () => {
            const plugin = new HwpCspPluginTest();
            equal(plugin.options().enabled, true);
        });
    });
});
