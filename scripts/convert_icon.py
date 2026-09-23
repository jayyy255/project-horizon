from PIL import Image
import os

src = r"C:/Users/Jay/.gemini/antigravity-ide/brain/5e251f9b-fb89-4476-914d-f189f4203a41/horizon_app_icon_1790188255158.jpg"
os.makedirs("build", exist_ok=True)
dst_png = os.path.join("build", "icon.png")
dst_ico = os.path.join("build", "icon.ico")

img = Image.open(src)
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(dst_png, format="PNG")
img_512.save(dst_ico, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

print(f"Generated {dst_png} and {dst_ico} at 512x512 resolution.")
