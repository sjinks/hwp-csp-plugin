import cheerio from 'cheerio';
import { HwpCspPlugin } from '../index';
import { getHWP, getWebpackConfig, runWebpack } from './utils';

class HwpCspPluginTest extends HwpCspPlugin {
    public options() {
        return this._options;
    }
}

describe('HwpCspPlugin', (): void => {
    it('should not alter a file when disabled', (done): void => {
        runWebpack(
            [
                getWebpackConfig([getHWP('script-style.html', false, 'index-1.html')]),
                getWebpackConfig([
                    getHWP('script-style.html', false, 'index-2.html'),
                    new HwpCspPlugin({ enabled: false }),
                ]),
            ],
            (html: Record<string, string>): void => {
                expect(html['index-1.html']).toBe(html['index-2.html']);
            },
            done,
        );
    });

    // Use `any` until Jest fixes typings for `each()` to add `done` callback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    it.each<any>([
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
    ])(
        'should add integrity attribute to inline styles and scripts when asked to (%p %p %p)',
        (
            addIntegrity: boolean,
            script: boolean,
            style: boolean,
            hashScript: string | undefined,
            hashStyle: string | undefined,
            done,
        ): void => {
            runWebpack(
                getWebpackConfig([
                    getHWP('script-style.html', false),
                    new HwpCspPlugin({ addIntegrity, hashEnabled: { script, style } }),
                ]),
                (html: Record<string, string>): void => {
                    const content = html['index.html'];
                    const $ = cheerio.load(content, { decodeEntities: false });
                    const scripts = $('script:not([src])');
                    const styles = $('style');

                    expect(scripts.length).toBe(1);
                    expect(styles.length).toBe(1);

                    expect(scripts.attr('integrity')).toEqual(hashScript);
                    expect(styles.attr('integrity')).toEqual(hashStyle);
                },
                done,
            );
        },
    );

    it('does not remove existing policies if the policy is empty', (done): void => {
        runWebpack(
            getWebpackConfig([getHWP('many-csps.html', false), new HwpCspPlugin({ hashEnabled: false })]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = cheerio.load(content, { decodeEntities: false });
                const metas = $('meta');
                expect(metas.length).toBe(3);

                const map: Record<string, string | undefined> = {
                    'Content-Security-Policy': "default-src 'self'",
                    'content-security-policy': '',
                    'CONTENT-security-policy': undefined,
                };

                metas.each((i, el): void => {
                    const attr = (el as cheerio.TagElement).attribs['http-equiv'];
                    const expected = map[attr];
                    expect((el as cheerio.TagElement).attribs['content']).toEqual(expected);
                });
            },
            done,
        );
    });

    it('replaces all existing policies with the new one', (done): void => {
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
                const $ = cheerio.load(content, { decodeEntities: false });
                const metas = $('meta');
                expect(metas.length).toBe(1);
                expect(metas.attr('http-equiv')).toBe('Content-Security-Policy');
                expect(metas.attr('content')).toBe(`default-src 'none'; script-src 'self'`);
            },
            done,
        );
    });

    it('leaves file as is if no policy specified and no scripts / styles to hash', (done): void => {
        runWebpack(
            getWebpackConfig([
                getHWP('csps-no-scripts-styles.html', false),
                new HwpCspPlugin({ addIntegrity: true, hashEnabled: true }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const $ = cheerio.load(content, { decodeEntities: false });
                const metas = $('meta');
                expect(metas.length).toBe(3);
            },
            done,
        );
    });

    it('adds hashes to script-src-elem / style-src-elem if they present', (done): void => {
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
                const $ = cheerio.load(content, { decodeEntities: false });
                const expected = `script-src-elem 'self' 'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa'; style-src-elem 'self' 'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x'; script-src 'sha384-KYa/C8JinUfJfMkYsCZONXok/iV51fg5yPuUdMoF6xEZRVN/+Nt1VMfcTcnknqaa'; style-src 'sha384-4PilAlQa7y4OZ9VElQ2NrsdUmqMF/1acM1oNUdMh+JEyU5OE6fFgbZSFGFZbwe6x'`;
                expect($('meta[http-equiv="Content-Security-Policy"]').attr('content')).toEqual(expected);
            },
            done,
        );
    });

    it('handles valueless policy attributes properly', (done) => {
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
                const $ = cheerio.load(content, { decodeEntities: false });
                const expected = `block-all-mixed-content; default-src 'self'`;
                expect($('meta[http-equiv="Content-Security-Policy"]').attr('content')).toEqual(expected);
            },
            done,
        );
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    it.each<any>([[true], [false]])('properly handles XHTML mode (%s)', (xhtml, done): void => {
        runWebpack(
            getWebpackConfig([
                getHWP('script-style.html', xhtml),
                new HwpCspPlugin({
                    policy: { 'default-src': "'self'" },
                }),
            ]),
            (html: Record<string, string>): void => {
                const content = html['index.html'];
                const matches = content.match(/(<meta[^>]+>)/);
                expect(matches).not.toBeNull();
                expect((matches as RegExpMatchArray)[1].match(/\/>$/) !== null).toBe(xhtml);
            },
            done,
        );
    });

    describe('option parser', (): void => {
        it('should enable the plugin by default', () => {
            const plugin = new HwpCspPluginTest();
            expect(plugin.options().enabled).toBe(true);
        });
    });
});
