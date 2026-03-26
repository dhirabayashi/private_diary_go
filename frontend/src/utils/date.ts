// 'sv'（スウェーデン）ロケールは YYYY-MM-DD 形式を返すため、JST 日付を簡潔に取得するために利用している
export const today = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })
