import axios from "axios";

export async function download(url: string): Promise<string> {
    const res = await axios.get<string>(url)
    return res.data
}

export async function downloadBytes(url: string): Promise<Buffer> {
    const res = await axios.get<ArrayBuffer>(url, {responseType: "arraybuffer"})
    return Buffer.from(res.data)
}
