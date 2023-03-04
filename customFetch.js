const customFetchCache = new Map()

let customFetchController = new window.AbortController()

export const customFetch = async (options) => {
    let url = ''

    if (typeof options === 'string') {
        url = options
    } else {
        if (options?.url) {
            url = options.url
        }
    }

    if (customFetch.baseUrl) {
        if (!url) {
            url = customFetch.baseUrl
        } else {
            url =
                url.startsWith('/') || url.startsWith('?')
                    ? `${customFetch.baseUrl}${url}`
                    : `${customFetch.baseUrl}/${url}`
        }
    }

    if (options?.params) {
        url = Object.entries(options.params)
            .reduce((a, [k, v]) => {
                a += `&${k}=${v}`
                return a
            }, url)
            // заменяем первый символ `&` на символ `?`
            .replace('&', '?')
    }

    url = window.decodeURI(url)

    if (!url) {
        return console.error('URL not provided!')
    }

    // настройки по дефолту
    let _options = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        referrerPolicy: 'no-referrer',
        customCache: true,
        log: false,
        signal: customFetchController.signal
    }

    // если опции есть то обьединяем с дефолтными
    if (typeof options === 'object') {
        _options = {
            ..._options,
            ...options
        }
    }

    if (
        _options.body &&
        _options.headers['Content-Type'] === 'application/json'
    ) {
        _options.body = JSON.stringify(_options.body)
    }

    if (customFetch.authToken) {
        _options.headers['Authorization'] = `Bearer ${customFetch.authToken}`
    }

    if (_options.log) {
        console.log(_options)
    }

    if (
        (_options.method === 'POST' || _options.method === 'PUT') &&
        !_options.body
    ) {
        console.warn('Body not provided!')
    }

    const handlers = options?.handlers

    if (handlers?.onAbort) {
        customFetchController.signal.addEventListener('abort', handlers.onAbort, {
            once: true
        })
    }

    if (
        _options.method === 'GET' &&
        _options.customCache &&
        customFetchCache.has(url)
    ) {
        const cachedData = customFetchCache.get(url)
        return handlers?.onSuccess ? handlers.onSuccess(cachedData) : cachedData
    }

    try {
        const response = await fetch(url, _options)

        const { status, statusText } = response

        const info = {
            headers: [...response.headers.entries()].reduce((a, [k, v]) => {
                a[k] = v
                return a
            }, {}),
            status,
            statusText,
            url: response.url
        }

        let data = null;

        const contentTypeHeader = response.headers.get('Content-Type')

        if (contentTypeHeader) {
            if (contentTypeHeader.includes('json')) {
                data = await response.json()
            } else if (contentTypeHeader.includes('text')) {
                data = await response.text()

                if (data.includes('Error:')) {
                    const errorMessage = data
                        .match(/Error:.[^<]+/)[0]
                        .replace('Error:', '')
                        .trim()

                    if (errorMessage) {
                        data = errorMessage
                    }
                }
            } else {
                data = response
            }
        } else {
            data = response
        }

        let result = null

        if (response.ok) {
            result = { data, error: null, info }

            if (!customFetch.authToken && typeof data === 'object' && ('token' in data || 'accesToken' in data)) {
                customFetch.authToken = data?.token || data?.accessToken || '';
                window.localStorage.setItem('x-token', customFetch.authToken)
            }
            if (_options.method === 'GET') {
                customFetchCache.set(url, result)

                if (_options.log) {
                    console.log(customFetchCache)
                }
            }

            if (_options.log) {
                console.log(result)
            }


            return handlers?.onSuccess ? handlers.onSuccess(result) : result
        }

        result = {
            data: null,
            error: data,
            info
        }

        if (_options.log) {
            console.log(result)
        }

        return handlers?.onError ? handlers.onError(result) : result
    } catch (err) {
        if (handlers?.onError) {
            handlers.onError(err)
        }
        console.error(err)
    }

    Object.defineProperties(customFetch, {
        baseUrl: {
            value: '',
            writable: true,
            enumerable: true
        },
        authToken: {
            value: '',
            writable: true,
            enumerable: true
        }
    })

    customFetch.cancel = () => {
        customFetchController.abort()
        customFetchController = new window.AbortController()
    }

    customFetch.get = (url, options) => {
        if (typeof url === 'string') {
            return customFetch({
                url,
                ...options
            })
        }
        return customFetch({
            ...url
        })
    }

    customFetch.post = (url, body, options) => {
        if (typeof url === 'string') {
            return customFetch({
                url,
                method: 'POST',
                body,
                ...options
            })
        }
        return customFetch({
            method: 'POST',
            body: url,
            ...body
        })
    }

    customFetch.update = (url, body, options) => {
        if (typeof url === 'string') {
            return customFetch({
                url,
                method: 'PUT',
                body,
                ...options
            })
        }
        return customFetch({
            method: 'PUT',
            body: url,
            ...body
        })
    }

    customFetch.remove = (url, options) => {
        if (typeof url === 'string') {
            return customFetch({
                url,
                method: 'DELETE',
                ...options
            })
        }
        return customFetch({
            ...url
        })
    }
}