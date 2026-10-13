use heic_rs::{DecodeOptions, PixelLayout, decode};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct DecodedImage {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[wasm_bindgen]
impl DecodedImage {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn take_rgba(self) -> Vec<u8> {
        self.rgba
    }
}

#[wasm_bindgen]
pub fn decode_heic(bytes: &[u8], max_pixels: u32) -> Result<DecodedImage, JsValue> {
    let options = DecodeOptions::default()
        .with_layout(PixelLayout::Rgba8)
        .with_max_pixels(Some(u64::from(max_pixels)));
    let image = decode(bytes, &options).map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(DecodedImage {
        width: image.width,
        height: image.height,
        rgba: image.data,
    })
}
