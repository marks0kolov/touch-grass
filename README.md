<img src="./readme_images/touching_grass.jpg" alt="a close-up of a hand touching grass">

This is an AI that can determine whether or not are you touching grass. My inspiration when creating this project was a popular [meme](https://knowyourmeme.com/memes/touch-grass) from the internet, where people jokingly tell each other to "go outside and touch grass" when they’re spending too much time on the computer.

## Inference

Clone the repository:

```bash
git clone https://github.com/marks0kolov/touch_grass.git
cd touch_grass
```
Install the required packages

```bash
pip3 install scripts/requirements.txt
```

Run inference on an image with the provided python script:

```bash
python3 scripts/check_touching_grass.py path_to_image.jpg models/grassNet/model.onnx models/poseNet/model.onnx
```

(don't forget to replace `path_to_image` with the actual path to image)

The script will load both ONNX models, use both of them to check if the image contains grass and a hand and print the result. To check for only grass or hands run `scripts/check_grass.py` and `scripts/check_hand.py` accordingly.

## Training

Firstly, I took 10.5k images of grass from various datasets on the internet (more info in [resources](#resources)). Then i added an image of a hand to 80% of those images, so that the model also accepts images with hands covering some part of it. I also downloaded 10k of indoor images from the Places365 dataset.<br>
Secondly, using the [`train.py`](https://github.com/dusty-nv/pytorch-classification/blob/3e9cf8c4003311009539a6c101d156c919fe2250/train.py) script from the [jetson-inference GitHub repo](https://github.com/dusty-nv/jetson-inference), I fine‑tuned an ImageNet‑pretrained ResNet‑18 on this dataset.<br>

I also took the original Pose ResNet-18 Hand ONNX model from the jetson-inference repository to detect hands on images.

## Results

To decide how good is the trained model and the entire script itself i've ran some tests on images of just grass, object taht are not grass and iamges of a hand touching grass.

## Resources

- Datasets
    - Deep Learning. 2025. *"Capstone Project – Grass Species."* Roboflow Universe. Roboflow, Inc.  https://universe.roboflow.com/deep-learning-4rbtb/capstone-project-grass-species
    - Iowa State University. 2024. *"Grass O0vum v1."* Roboflow Universe. Roboflow, Inc. https://universe.roboflow.com/iowa-state-university-krhld/grass-o0vum
    - Usharengaraju. n.d. *"GrassClover Dataset."* Kaggle. Accessed July 24, 2025. https://www.kaggle.com/datasets/usharengaraju/grassclover-dataset
    - Timofeymoiseev. n.d. *"Grass Detection Dataset."* Kaggle. Accessed July 24, 2025. https://www.kaggle.com/datasets/timofeymoiseev/grass
    - Jonasdahlqvist. n.d. *"Grass‑NoGrass Dataset."* Kaggle. Accessed July 24, 2025. https://www.kaggle.com/datasets/jonasdahlqvist/grass-nograss-dataset
    - CSAILVision. 2017. *"Places365‑CNNs for Scene Classification"*. GitHub. https://github.com/CSAILVision/places365.  Accessed July 24, 2025.

- Models
    - Image ResNet-18
    - Pose ResNet-18

- NVIDIA Jetson Orin Nano

- [jetson-inference GitHub repo](https://github.com/dusty-nv/jetson-inference)
