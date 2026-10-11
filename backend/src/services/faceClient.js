import axios from "axios";

const baseURL = () => process.env.FACE_SERVICE_URL || "http://localhost:5000";

export const verifyFace = async ({ epic, frames, challenge }) => {
    const { data } = await axios.post(`${baseURL()}/verify`,
        { epic, frames, challenge },
        { timeout: 45000, maxBodyLength: Infinity, maxContentLength: Infinity });
    return data;
};

export const enrollFace = async ({ epic, image }) => {
    const { data } = await axios.post(`${baseURL()}/enroll`,
        { epic, image },
        { timeout: 30000, maxBodyLength: Infinity, maxContentLength: Infinity });
    return data;
};
