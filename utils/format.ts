export const formatNumber = (num: string | number) => {
    if (!num) return "";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const parseNumber = (text: string) => {
    return text.replace(/\./g, "").replace(/,/g, "");
};
