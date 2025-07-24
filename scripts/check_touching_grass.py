import os, cv2, numpy as np, onnxruntime as rt
from yaspin import yaspin; from yaspin.spinners import Spinners
from rich import print
import argparse

########################################## - funcs - ##########################################

def check_grass(image_path: str, model_path: str, thresh: float = 0.1) -> bool:
    'return True if the image contains grass'
    # locate labels.txt in the same folder as model
    labels_file = os.path.join(os.path.dirname(model_path), "labels.txt")
    if not os.path.isfile(labels_file):
        raise FileNotFoundError("labels.txt not found next to model")

    # read class labels
    with open(labels_file) as f:
        labels = [l.strip() for l in f]

    # load model (prefer tensorrt/cuda if available, else cpu):
    avail = rt.get_available_providers()
    providers = [p for p in ('TensorrtExecutionProvider', 'CUDAExecutionProvider') if p in avail]
    providers.append('CPUExecutionProvider')
    sess = rt.InferenceSession(model_path, providers=providers)

    # get required image size
    inp = sess.get_inputs()[0]
    h, w = inp.shape[2] or 224, inp.shape[3] or 224
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    # resize and normalize image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"cannot read {image_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (w, h)).astype(np.float32) / 255.0
    img = (img - mean) / std
    tensor = np.transpose(img, (2, 0, 1))[None, ...]

    # run inference
    probs = sess.run(None, {inp.name: tensor})[0][0]
    idx   = int(np.argmax(probs))
    conf  = probs[idx]

    # return True if predicted label is 'grass' and confidence ≥ thresh
    return labels[idx].lower() == "grass" and conf >= thresh

def check_hand(image_path: str, model_path: str, thresh: float = 0.1, min_joints: int = 3) -> bool:
    'return True if the image contains a hand'
    # load model (prefer tensorrt/cuda if available, else cpu):
    avail = rt.get_available_providers()
    providers = [p for p in ('TensorrtExecutionProvider', 'CUDAExecutionProvider') if p in avail]
    providers.append('CPUExecutionProvider')
    sess = rt.InferenceSession(model_path, providers=providers)

    # get required image size
    inp = sess.get_inputs()[0]
    h, w = (inp.shape[2] or 256), (inp.shape[3] or 256)

    # resize and normalize image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"cannot read {image_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (w, h)).astype(np.float32) / 255.0
    img = (img - 0.5) / 0.5
    tensor = np.transpose(img, (2, 0, 1))[None, ...]

    # run inference and evaluate output
    cmap, _ = sess.run(None, {inp.name: tensor})
    total = 0
    for channel in cmap[0]:
        _, binmap = cv2.threshold(channel, thresh, 1, cv2.THRESH_BINARY)
        n, _ = cv2.connectedComponents(binmap.astype(np.uint8))
        total += max(n - 1, 0)
        if total >= min_joints:
            return True
    return False

########################################## - main code ##########################################

# define argument parser:
parser = argparse.ArgumentParser(
    description='run 2 models on an image to determine if the image contains a hand touching grass'
)
# define arguments:
parser.add_argument(
    'image_path',
    help='path to the image'
)
parser.add_argument(
    'grassNet_path',
    help='path to the model to classificate grass'
)
parser.add_argument(
    'poseNet_path',
    help='path to the model to detect hands'
)

args = parser.parse_args() # get arguments

# parse arguments:
image_path = args.image_path
grassNet_path = args.grassNet_path
poseNet_path = args.poseNet_path

with yaspin(Spinners.dots6, text="Processing...") as spinner:
    try:
        has_grass = check_grass(image_path, grassNet_path)
        if has_grass:
            spinner.write("\033[32mGrass detected!\033[0m")
        else:
            spinner.write("\033[31mNo grass detected!\033[0m")
        has_hand = check_hand(image_path, poseNet_path)
        if has_hand:
            spinner.write("\033[32mHand detected!\033[0m")
        else:
            spinner.write("\033[31mNo hand detected!\033[0m")
        if has_grass and has_hand:
            spinner.write("✅ \033[32mYou are touching grass!\033[0m")
        else:
            spinner.write("❌ \033[31mYou are NOT touching grass!\033[0m")
        spinner.hide()
    except Exception as e:
        spinner.text = "Processing failed"
        spinner.fail("❌")
        print(f'[bold red]Error:[/]\n {e}')
