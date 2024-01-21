import qs from 'qs'

export default class RestApi {
  private key!: string
  private url_api: string = ''
  private url_refresh: string = ''
  private headers = {
    Accept: 'application/json',
    Authorization: '',
    'Content-Type': 'application/json'
  }
  private is_refresh_running = false
  private cbPreFetch?: (() => void) | null
  private cbPostFetch?: (() => void) | null
  private cbHandlerErrorResponse?: ((errors?: any) => void) | null
  private cbHandlerErrorRefreshToken?: (() => void) | null

  private static rest_api_collection: IRestApiCollection = {}

  constructor(key: string, options?: IRestApiOptions) {
    if (!options) {
      if (RestApi.rest_api_collection[key]) {
        //возвращаем instance
        return RestApi.rest_api_collection[key]
      }

      //создаем instance с дефолтными(пустыми) настройками и возвращаем его
      this.key = key
      RestApi.rest_api_collection[key] = this
      return this
    } else {
      if (RestApi.rest_api_collection[key]) {
        //изменяем конфигурацию instanc'а
        RestApi.rest_api_collection[key].url_api = options.url_api
        RestApi.rest_api_collection[key].url_refresh = options.url_refresh
        RestApi.rest_api_collection[key].headers.Authorization = `Bearer ${options.token}`
        RestApi.rest_api_collection[key].cbPreFetch = options.cbPreFetch
        RestApi.rest_api_collection[key].cbPostFetch = options.cbPostFetch
        RestApi.rest_api_collection[key].cbHandlerErrorResponse = options.cbHandlerErrorResponse
        RestApi.rest_api_collection[key].cbHandlerErrorRefreshToken = options.cbHandlerErrorRefreshToken //prettier-ignore
      } else {
        //создаем конфигурацию instance
        this.key = key
        this.url_api = options.url_api
        this.url_refresh = options.url_refresh
        this.headers.Authorization = `Bearer ${options.token}`
        this.cbPreFetch = options.cbPreFetch
        this.cbPostFetch = options.cbPostFetch
        this.cbHandlerErrorResponse = options.cbHandlerErrorResponse
        this.cbHandlerErrorRefreshToken = options.cbHandlerErrorRefreshToken

        RestApi.rest_api_collection[key] = this
        return this
      }
    }
  }

  private async refreshToken(url_refresh: string) {
    const response = await fetch(url_refresh, {
      method: 'POST',
      headers: this.headers
    })

    if (response.status === 200) {
      const response_data = (await response.json()) as ResponseRefresh
      localStorage.setItem(`${this.key}_token`, response_data.payload.token)
      this.headers.Authorization = `Bearer ${response_data.payload.token}`
      document.dispatchEvent(new CustomEvent(`tokenRefreshed_${this.key}`, { detail: { succes: true } })) //prettier-ignore
      return true
    }

    document.dispatchEvent(new CustomEvent(`tokenRefreshed_${this.key}`, { detail: { succes: false } })) //prettier-ignore
    return false
  }

  private async useFetch<IResponseType>(endpoint: string, method: RestMethodsType, options?: RestApiOverrideOptionsType, params?: any, body?: any): Promise<IResponseType | null> {
    try {
      if (options?.cbPreFetch !== null) {
        options?.cbPreFetch ? options.cbPreFetch() : this.cbPreFetch && this.cbPreFetch() //prettier-ignore
      }

      let search_params = ''
      if (params) {
        search_params = qs.stringify(params, { encode: false })
      }

      const headers = options?.headers ? { Authorization: this.headers.Authorization, ...options.headers } : this.headers
      const _body = body instanceof FormData ? body : JSON.stringify(body)
      const url_api = options?.url_api ?? this.url_api
      const url = url_api + endpoint + (search_params ? `?${search_params}` : '')
      const response = await fetch(url, { method, body: _body, headers })

      const response_json = await response.json()

      if (response.status === 401 && !this.is_refresh_running) {
        this.is_refresh_running = true
        const is_success = await this.refreshToken(options?.url_refresh ?? this.url_refresh)
        this.is_refresh_running = false
        if (is_success) {
          //стоит порезать options, чтобы дважды не срабатывал preFetch... (вставить функцию пустышку)
          return this.useFetch(endpoint, method, options, params, body)
        } else {
          if (options?.cbHandlerErrorRefreshToken !== null) {
            options?.cbHandlerErrorRefreshToken ? options.cbHandlerErrorRefreshToken() : this.cbHandlerErrorRefreshToken && this.cbHandlerErrorRefreshToken()
          }

          return null
        }
      } else if (response.status === 401) {
        return new Promise((res) => {
          document.addEventListener(
            `tokenRefreshed_${this.key}`,
            async (event: any) => {
              if (event?.detail?.succes) {
                //стоит порезать options, чтобы дважды не срабатывал preFetch... (вставить функцию пустышку)
                const response = await this.useFetch<IResponseType>(endpoint, method, options, params, body)
                res(response)
              } else {
                res(null)
              }
            },
            { once: true }
          )
        })
      } else if (response.status < 400) {
        //сюда можно дописать вариант без распаковки ответа
        if (response_json.meta) {
          return response_json
        } else {
          return response_json.payload
        }
      } else {
        if (options?.cbHandlerErrorResponse !== null) {
          options?.cbHandlerErrorResponse ? options?.cbHandlerErrorResponse(response_json) : this.cbHandlerErrorResponse && this.cbHandlerErrorResponse(response_json)
        }

        return null
      }
    } catch (error) {
      if (options?.cbHandlerErrorResponse !== null) {
        options?.cbHandlerErrorResponse ? options?.cbHandlerErrorResponse(error) : this.cbHandlerErrorResponse && this.cbHandlerErrorResponse(error)
      }

      return null
    } finally {
      if (options?.cbPostFetch !== null) {
        options?.cbPostFetch ? options.cbPostFetch() : this.cbPostFetch && this.cbPostFetch()
      }
    }
  }

  get<IResponseType>(endpoint: string, params?: any, options?: RestApiOverrideOptionsType): Promise<IResponseType | null> {
    return this.useFetch<IResponseType>(endpoint, 'GET', options, params)
  }

  post<IResponseType>(endpoint: string, body?: any, params?: any, options?: RestApiOverrideOptionsType): Promise<IResponseType | null> {
    return this.useFetch<IResponseType>(endpoint, 'POST', options, params, body)
  }

  put<IResponseType>(endpoint: string, body?: any, params?: any, options?: RestApiOverrideOptionsType): Promise<IResponseType | null> {
    return this.useFetch<IResponseType>(endpoint, 'PUT', options, params, body)
  }

  patch<IResponseType>(endpoint: string, body?: any, params?: any, options?: RestApiOverrideOptionsType): Promise<IResponseType | null> {
    return this.useFetch<IResponseType>(endpoint, 'PATCH', options, params, body)
  }

  delete<IResponseType>(endpoint: string, params?: any, body?: any, options?: Partial<IRestApiOptions>): Promise<IResponseType | null> {
    return this.useFetch<IResponseType>(endpoint, 'DELETE', options, params, body)
  }
}

interface IRestApiOptions {
  url_api: string
  url_refresh: string
  token: string
  cbPreFetch?: (() => void) | null
  cbPostFetch?: (() => void) | null
  cbHandlerErrorResponse?: ((errors?: any) => void) | null
  cbHandlerErrorRefreshToken?: (() => void) | null
}

type RestApiOverrideOptionsType = Partial<Omit<IRestApiOptions, 'token'>> & {
  headers?: Record<string, string>
}

interface IRestApiCollection {
  [index: string]: RestApi
}

interface ResponseRefresh {
  payload: {
    token: string
  }
}

type RestMethodsType = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'
