package com.billing.pos.dto;

import lombok.Data;

@Data
public class GalleryPhotoData {
    private Long billId;
    private String billDisplay;
    private String date;
    private String customerName;
    private String itemName;
    private Double metalWt;
    private Double finishingWt;
    private Double purity;
    private Double wastagePer;
    private Double stoneWt;
    private Double stoneWastage;
    private Double stoneCost;
    private Double gramRate;
    private String chargeType;
    private Double chargeAmt;
    private String image1;
    private String image2;
}
