from PIL import Image
import os

def remove_white_bg(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Change all white (also shades of whites)
            # using a threshold to catch near-whites like (240, 240, 240)
            if item[0] > 220 and item[1] > 220 and item[2] > 220:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        
        # Crop transparent borders
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
            
        img.save(output_path, "PNG")
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    icon_path = os.path.join("assets", "icon.png")
    remove_white_bg(icon_path, icon_path)
