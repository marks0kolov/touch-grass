#!/usr/bin/env python3

import sys, os
import numpy as np
import cv2
import onnxruntime as rt
from yaspin import yaspin
from yaspin.spinners import Spinners
from rich import print

# check the amount of arguemnts:
if len(sys.argv) != 3:
    print(f"[bold red]Error: Incorrect usage. Please use {sys.argv[0]} pose_resnet18_hand.onnx image_or_folder[/]")
    sys.exit(1)

model_path, path = sys.argv[1], sys.argv[2] # get arguments

# get image(s) paths:
if os.path.isdir(path):
    files = os.listdir(path)
    imgs = [f for f in files if f.lower().endswith('.jpg')]
    if len(imgs) != len(files): # raise error if the dir doesn't only contain jpg images
        print("[bold red]Error: Folder must contain only .jpg images")
        sys.exit(1)
    image_paths = [os.path.join(path, f) for f in imgs]
else:
    image_paths = [path]

# load model (prefer TensorRT/CUDA if available, fall back to CPU):
avail = rt.get_available_providers()
providers = [p for p in ('TensorrtExecutionProvider','CUDAExecutionProvider') if p in avail]
providers.append('CPUExecutionProvider')
sess = rt.InferenceSession(model_path, providers=providers)

# read models expected image size:
inp = sess.get_inputs()[0]
h, w = inp.shape[2] or 256, inp.shape[3] or 256
input_name = inp.name

# func for processing the image and normalizing it for inputting in model:
def preprocess(p):
    img = cv2.imread(p)
    if img is None:
        raise ValueError(f"cannot read {p}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) # BGR -> RGB
    img = cv2.resize(img, (w, h)).astype(np.float32) / 255.0 # resize image
    img = (img - 0.5) / 0.5 # normalize colors
    return np.transpose(img, (2, 0, 1))[None, ...]

# func to check for a hand and return True if there is a hand
def check_hand(cmap: np.ndarray, thresh: float = 0.1, min_joints: int = 3) -> bool:
    "returns True if total detected joint blobs across all channels >= min_joints"
    total = 0
    for channel in cmap:
        _, binmap = cv2.threshold(channel, thresh, 1, cv2.THRESH_BINARY)
        n_labels, _ = cv2.connectedComponents(binmap.astype(np.uint8))
        total += max(n_labels - 1, 0)
        if total >= min_joints:
            return True
    return False

total_hands = 0

with yaspin(Spinners.dots6, text="Processing...") as spinner: # using yaspin for processing animation
    try:
        for img_path in image_paths:
            name = os.path.basename(img_path)
            spinner.text = f"Processing {name}"

            tensor = preprocess(img_path) # prepare input
            outputs = sess.run(None, {input_name: tensor}) # run model
            cmap, paf = outputs # hand heatmaps
            hands = 1 if check_hand(cmap[0]) else 0 # count hands
            total_hands += hands

            spinner.write(f"{name} -> {hands} hand{'s' if hands != 1 else ''}")

        spinner.text = f"Processed {len(image_paths)} image{'s' if len(image_paths)!=1 else ''}"
        spinner.ok("✔")
        print(f"[bold green]Total hands detected:[/] {total_hands}") # print output

    except Exception as e:
        spinner.fail("✖")
        print(f"[bold red]Error:[/] {e}") # print error info
