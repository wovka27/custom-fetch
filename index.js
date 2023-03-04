import {customFetch} from "./customFetch.js";

customFetch.baseUrl = 'https://jsonplaceholder.typicode.com'
const getTodos = async () => {
    const {data, error, info} = await customFetch({
        url: 'posts',
        params: {
        _userId: 1,
            _limit: 4,
        },
        log: true
    })
}